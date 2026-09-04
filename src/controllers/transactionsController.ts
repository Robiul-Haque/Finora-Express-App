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

export const getTransactions = catchAsync(async (req: Request, res: Response) => {
  const queryParams = getTransactionsQuerySchema.parse(req.query);
  const { accountId, type, dateRange, sortBy, searchQuery, limit, offset } = queryParams;

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

  if (searchQuery && searchQuery.trim()) {
    const escaped = searchQuery.trim().replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
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

  let balanceDelta = 0;
  let sendDelta = 0;
  let receiveDelta = 0;
  const profitDelta = validated.profit || validated.margin || 0;

  const isOutflow =
    validated.type === 'send_money' ||
    validated.type === 'cash_out' ||
    validated.type === 'b2b' ||
    validated.type === 'sm' ||
    validated.type === 'co' ||
    validated.type === 'send';

  const isInflow =
    validated.type === 'receive_money' ||
    validated.type === 'cash_in' ||
    validated.type === 'recev';

  if (isOutflow) {
    balanceDelta = -(validated.amount + validated.cost);
    sendDelta = validated.amount;
  } else if (isInflow) {
    balanceDelta = validated.amount;
    receiveDelta = validated.amount;
  } else if (validated.type === 'adjustment') {
    balanceDelta = validated.amount;
  }

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

  await AccountModel.findByIdAndUpdate(validated.accountId, {
    $inc: {
      balance: balanceDelta,
      todaySend: sendDelta,
      todayReceive: receiveDelta,
      todayProfit: profitDelta,
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

  // Update transaction fields
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

  let balanceRevert = 0;
  let sendRevert = 0;
  let receiveRevert = 0;
  const profitRevert = tx.profit || tx.margin || 0;

  const isOutflow =
    tx.type === 'send_money' ||
    tx.type === 'cash_out' ||
    tx.type === 'b2b' ||
    tx.type === 'sm' ||
    tx.type === 'co' ||
    tx.type === 'send';

  const isInflow =
    tx.type === 'receive_money' ||
    tx.type === 'cash_in' ||
    tx.type === 'recev';

  if (isOutflow) {
    balanceRevert = tx.amount + tx.cost;
    sendRevert = -tx.amount;
  } else if (isInflow) {
    balanceRevert = -tx.amount;
    receiveRevert = -tx.amount;
  } else if (tx.type === 'adjustment') {
    balanceRevert = -tx.amount;
  }

  await AccountModel.findByIdAndUpdate(tx.accountId, {
    $inc: {
      balance: balanceRevert,
      todaySend: sendRevert,
      todayReceive: receiveRevert,
      todayProfit: -profitRevert,
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
