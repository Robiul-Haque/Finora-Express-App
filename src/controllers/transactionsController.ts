import { Request, Response } from 'express';
import { TransactionModel } from '../models/Transaction.js';
import { AccountModel } from '../models/Account.js';
import { createTransactionSchema, getTransactionsQuerySchema } from '../validators/index.js';
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
    const escaped = searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'i');
    filter.$or = [
      { accountNumber: regex },
      { accountName: regex },
      { recipientNumber: regex },
      { senderNumber: regex },
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
  const profitDelta = validated.profit || 0;

  if (validated.type === 'send_money' || validated.type === 'cash_out' || validated.type === 'b2b') {
    balanceDelta = -(validated.amount + validated.cost);
    sendDelta = validated.amount;
  } else if (validated.type === 'receive_money' || validated.type === 'cash_in') {
    balanceDelta = validated.amount;
    receiveDelta = validated.amount;
  } else if (validated.type === 'adjustment') {
    balanceDelta = validated.amount;
  }

  // 2. Atomic balance & stats increment
  await AccountModel.findByIdAndUpdate(
    validated.accountId,
    {
      $inc: {
        balance: balanceDelta,
        todaySend: sendDelta,
        todayReceive: receiveDelta,
        todayProfit: profitDelta,
      },
    },
    { returnDocument: 'after' }
  );

  // 3. Create transaction record
  const newTxDoc = await TransactionModel.create({
    _id: id,
    clientTxId,
    accountId: validated.accountId,
    accountNumber: validated.accountNumber,
    accountName: validated.accountName,
    type: validated.type,
    amount: validated.amount,
    recipientNumber: validated.recipientNumber || undefined,
    senderNumber: validated.senderNumber || undefined,
    cost: validated.cost,
    profit: validated.profit,
    date,
    note: validated.note || undefined,
    syncStatus: 'synced',
  });

  const txObj = newTxDoc.toObject ? newTxDoc.toObject() : newTxDoc;
  const createdTx = formatTransaction(txObj);
  const updatedAccounts = await getAccountsInternal();

  sendResponse(res, {
    statusCode: 201,
    data: {
      transaction: createdTx,
      updatedAccounts,
    },
  });
});

export const deleteTransaction = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const txToDelete = await TransactionModel.findById(id).lean();

  if (!txToDelete) {
    throw new AppError('Transaction not found', 404);
  }

  let balanceDelta = 0;
  let sendDelta = 0;
  let receiveDelta = 0;
  const profitDelta = -(txToDelete.profit || 0);

  if (txToDelete.type === 'send_money' || txToDelete.type === 'cash_out' || txToDelete.type === 'b2b') {
    balanceDelta = +(txToDelete.amount + txToDelete.cost);
    sendDelta = -txToDelete.amount;
  } else if (txToDelete.type === 'receive_money' || txToDelete.type === 'cash_in') {
    balanceDelta = -txToDelete.amount;
    receiveDelta = -txToDelete.amount;
  } else if (txToDelete.type === 'adjustment') {
    balanceDelta = -txToDelete.amount;
  }

  await AccountModel.findByIdAndUpdate(txToDelete.accountId, {
    $inc: {
      balance: balanceDelta,
      todaySend: sendDelta,
      todayReceive: receiveDelta,
      todayProfit: profitDelta,
    },
  });

  await TransactionModel.findByIdAndDelete(id);

  const updatedAccounts = await getAccountsInternal();
  sendResponse(res, { statusCode: 200, data: { deletedId: id, updatedAccounts } });
});