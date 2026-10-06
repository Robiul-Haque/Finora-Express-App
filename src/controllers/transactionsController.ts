import { Request, Response } from 'express';
import { TransactionModel } from '../models/Transaction.js';
import { AccountModel } from '../models/Account.js';
import { createTransactionSchema, updateTransactionSchema, getTransactionsQuerySchema } from '../validators/index.js';
import { Transaction } from '../types/index.js';
import { getAccountsInternal } from './accountsController.js';
import { catchAsync } from '../utils/catchAsync.js';
import { sendResponse } from '../utils/sendResponse.js';
import { AppError } from '../utils/AppError.js';
import { formatTransaction } from '../utils/formatters.js';
import { calculateDeltas } from '../utils/transactionHelpers.js';

export const getTransactions = catchAsync(async (req: Request, res: Response) => {
  const queryParams = getTransactionsQuerySchema.parse(req.query);
  const { accountId, type, dateRange, startDate, endDate, sortBy, searchQuery, limit, offset } = queryParams;

  const filter: any = {};

  if (accountId && accountId !== 'all') {
    filter.accountId = accountId;
  }

  if (type && type !== 'all') {
    filter.type = type;
  }

  const now = new Date();
  if (dateRange === 'today') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    filter.date = { $gte: startOfToday };
  } else if (dateRange === 'yesterday') {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    filter.date = { $gte: startOfYesterday, $lt: startOfToday };
  } else if (dateRange === 'this_week') {
    const startOfWeek = new Date(Date.now() - 7 * 86400000);
    filter.date = { $gte: startOfWeek };
  } else if (dateRange === 'this_month') {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    filter.date = { $gte: startOfMonth };
  }

  if (startDate || endDate) {
    filter.date = filter.date || {};
    if (startDate) {
      filter.date.$gte = new Date(startDate);
    }
    if (endDate) {
      filter.date.$lte = new Date(endDate);
    }
  }

  if (searchQuery && searchQuery.trim()) {
    const escaped = searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.$or = [
      { accountNumber: regex },
      { accountName: regex },
      { recipientNumber: regex },
      { senderNumber: regex },
      { counterparty: regex },
      { note: regex },
    ];
  }

  let sortOptions: any = { date: -1 };
  if (sortBy === 'oldest') {
    sortOptions = { date: 1 };
  } else if (sortBy === 'amount_high') {
    sortOptions = { amount: -1 };
  } else if (sortBy === 'amount_low') {
    sortOptions = { amount: 1 };
  } else if (sortBy === 'profit_high') {
    sortOptions = { profit: -1 };
  }

  const docs = await TransactionModel.find(filter).sort(sortOptions).skip(offset).limit(limit).lean();
  const transactions: Transaction[] = docs.map(formatTransaction);

  sendResponse(res, { statusCode: 200, data: transactions });
});

export const createTransaction = catchAsync(async (req: Request, res: Response) => {
  const validated = createTransactionSchema.parse(req.body);
  const headerIdempotency = req.headers['x-idempotency-key'] as string | undefined;
  const clientTxId =
    validated.clientTxId ||
    headerIdempotency ||
    `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

  // 1. Idempotency check
  const existingTx = await TransactionModel.findOne({
    $or: [{ clientTxId }, { _id: clientTxId }],
  }).lean();

  if (existingTx) {
    const accounts = await getAccountsInternal();
    sendResponse(res, {
      statusCode: 200,
      data: {
        transaction: formatTransaction(existingTx),
        updatedAccounts: accounts,
        idempotentReplay: true,
      },
    });
    return;
  }

  const targetAccount = await AccountModel.findById(validated.accountId).lean();
  if (!targetAccount) {
    throw new AppError('Selected account not found', 404);
  }

  const id = clientTxId;
  const date = validated.date ? new Date(validated.date) : new Date();

  const profitDelta = validated.profit !== undefined && validated.profit > 0
    ? validated.profit
    : (validated.margin !== undefined ? validated.margin : 0);

  const deltas = calculateDeltas(validated.type, validated.amount, validated.cost, profitDelta);

  const newDoc = await TransactionModel.create({
    _id: id,
    clientTxId,
    accountId: validated.accountId,
    accountNumber: validated.accountNumber,
    accountName: validated.accountName,
    type: validated.type,
    amount: validated.amount,
    margin: profitDelta,
    runningBalance: validated.runningBalance,
    counterparty: (validated.counterparty || validated.recipientNumber || validated.senderNumber) || undefined,
    recipientNumber: validated.recipientNumber || undefined,
    senderNumber: validated.senderNumber || undefined,
    cost: validated.cost,
    profit: profitDelta,
    date,
    note: validated.note || undefined,
    syncStatus: 'synced',
  });

  const isSend = validated.type === 'sm' || validated.type === 'send_money' || validated.type === 'send';
  const monthlyUsedDelta = isSend ? validated.amount : 0;

  await AccountModel.findByIdAndUpdate(validated.accountId, {
    $inc: {
      balance: deltas.balanceDelta,
      todaySend: deltas.sendDelta,
      todayReceive: deltas.receiveDelta,
      todayProfit: deltas.profitDelta,
      totalMargin: deltas.profitDelta,
      monthlyLimitUsed: monthlyUsedDelta,
      remainingLimit: -monthlyUsedDelta,
    },
  });

  const accounts = await getAccountsInternal();

  sendResponse(res, {
    statusCode: 201,
    data: {
      transaction: formatTransaction(newDoc),
      updatedAccounts: accounts,
    },
  });
});

export const updateTransaction = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const validated = updateTransactionSchema.parse(req.body);

  const existingTx = await TransactionModel.findOne({
    $or: [{ _id: id }, { clientTxId: id }],
  });

  if (!existingTx) {
    throw new AppError('Transaction not found', 404);
  }

  // 1. Calculate previous deltas
  const oldProfit = typeof existingTx.profit === 'number'
    ? existingTx.profit
    : (typeof existingTx.margin === 'number' ? existingTx.margin : 0);
  const oldDeltas = calculateDeltas(existingTx.type, existingTx.amount, existingTx.cost, oldProfit);

  // 2. Compute updated values
  const newType = validated.type || existingTx.type;
  const newAmount = validated.amount !== undefined ? validated.amount : existingTx.amount;
  const newCost = validated.cost !== undefined ? validated.cost : (existingTx.cost || 0);
  const newProfit = validated.profit !== undefined
    ? validated.profit
    : (validated.margin !== undefined ? validated.margin : oldProfit);
  const newDeltas = calculateDeltas(newType, newAmount, newCost, newProfit);

  // 3. Update transaction document fields
  if (validated.note !== undefined) existingTx.note = validated.note || undefined;
  if (validated.counterparty !== undefined) existingTx.counterparty = validated.counterparty || undefined;
  if (validated.recipientNumber !== undefined) existingTx.recipientNumber = validated.recipientNumber || undefined;
  if (validated.senderNumber !== undefined) existingTx.senderNumber = validated.senderNumber || undefined;
  if (validated.amount !== undefined) existingTx.amount = validated.amount;
  if (validated.cost !== undefined) existingTx.cost = validated.cost;
  if (validated.profit !== undefined) existingTx.profit = validated.profit;
  if (validated.margin !== undefined) existingTx.margin = validated.margin;
  if (validated.type !== undefined) existingTx.type = validated.type;
  if (validated.date !== undefined) existingTx.date = new Date(validated.date);

  await existingTx.save();

  // 4. Atomically adjust account balance and metrics with difference
  const balanceDiff = newDeltas.balanceDelta - oldDeltas.balanceDelta;
  const sendDiff = newDeltas.sendDelta - oldDeltas.sendDelta;
  const receiveDiff = newDeltas.receiveDelta - oldDeltas.receiveDelta;
  const profitDiff = newDeltas.profitDelta - oldDeltas.profitDelta;

  const oldIsSend = existingTx.type === 'sm' || existingTx.type === 'send_money' || existingTx.type === 'send';
  const newIsSend = newType === 'sm' || newType === 'send_money' || newType === 'send';
  const oldUsed = oldIsSend ? existingTx.amount : 0;
  const newUsed = newIsSend ? newAmount : 0;
  const usedDiff = newUsed - oldUsed;

  if (balanceDiff !== 0 || sendDiff !== 0 || receiveDiff !== 0 || profitDiff !== 0 || usedDiff !== 0) {
    await AccountModel.findByIdAndUpdate(existingTx.accountId, {
      $inc: {
        balance: balanceDiff,
        todaySend: sendDiff,
        todayReceive: receiveDiff,
        todayProfit: profitDiff,
        totalMargin: profitDiff,
        monthlyLimitUsed: usedDiff,
        remainingLimit: -usedDiff,
      },
    });
  }

  const accounts = await getAccountsInternal();

  sendResponse(res, {
    statusCode: 200,
    data: {
      transaction: formatTransaction(existingTx),
      updatedAccounts: accounts,
    },
  });
});

export const deleteTransaction = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;

  const tx = await TransactionModel.findOne({
    $or: [{ _id: id }, { clientTxId: id }],
  }).lean();

  if (!tx) {
    throw new AppError('Transaction not found', 404);
  }

  await TransactionModel.deleteOne({ _id: tx._id });

  const profit = typeof tx.profit === 'number'
    ? tx.profit
    : (typeof tx.margin === 'number' ? tx.margin : 0);
  const deltas = calculateDeltas(tx.type, tx.amount, tx.cost, profit);

  // Reverse previous transaction effect on account
  const isSendDel = tx.type === 'sm' || tx.type === 'send_money' || tx.type === 'send';
  const usedDeltaDel = isSendDel ? tx.amount : 0;

  await AccountModel.findByIdAndUpdate(tx.accountId, {
    $inc: {
      balance: -deltas.balanceDelta,
      todaySend: -deltas.sendDelta,
      todayReceive: -deltas.receiveDelta,
      todayProfit: -deltas.profitDelta,
      totalMargin: -deltas.profitDelta,
      monthlyLimitUsed: -usedDeltaDel,
      remainingLimit: usedDeltaDel,
    },
  });

  const accounts = await getAccountsInternal();

  sendResponse(res, {
    statusCode: 200,
    data: {
      deletedId: id,
      updatedAccounts: accounts,
    },
  });
});
