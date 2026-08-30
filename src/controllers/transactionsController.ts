import { Request, Response, NextFunction } from 'express';
import { TransactionModel } from '../models/Transaction.js';
import { AccountModel } from '../models/Account.js';
import { createTransactionSchema, getTransactionsQuerySchema } from '../validators/index.js';
import { Transaction } from '../types/index.js';
import { getAccountsInternal } from './accountsController.js';

function formatTransaction(doc: any): Transaction {
  return {
    id: doc._id ? doc._id.toString() : doc.id,
    clientTxId: doc.clientTxId,
    accountId: doc.accountId,
    accountNumber: doc.accountNumber,
    accountName: doc.accountName,
    type: doc.type,
    amount: doc.amount,
    recipientNumber: doc.recipientNumber || undefined,
    senderNumber: doc.senderNumber || undefined,
    cost: typeof doc.cost === 'number' ? doc.cost : 0,
    profit: typeof doc.profit === 'number' ? doc.profit : 0,
    date: doc.date instanceof Date ? doc.date.toISOString() : doc.date,
    note: doc.note || undefined,
    syncStatus: doc.syncStatus,
    retryCount: doc.retryCount,
    lastError: doc.lastError || undefined,
  };
}

export const getTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
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
      const q = searchQuery.trim();
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      filter.$or = [
        { accountNumber: regex },
        { accountName: regex },
        { recipientNumber: regex },
        { senderNumber: regex },
        { note: regex },
      ];
    }

    // Sort order mapping
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

    // Fast indexed query with .lean() for zero serialization overhead
    const docs = await TransactionModel.find(filter)
      .sort(sortOptions)
      .skip(offset)
      .limit(limit)
      .lean();

    const transactions: Transaction[] = docs.map(formatTransaction);
    res.json(transactions);
  } catch (err) {
    next(err);
  }
};

export const createTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = createTransactionSchema.parse(req.body);
    const headerIdempotency = req.headers['x-idempotency-key'] as string | undefined;
    const clientTxId =
      validated.clientTxId ||
      headerIdempotency ||
      `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // 1. Check for duplicate idempotent request
    const existingTx = await TransactionModel.findOne({
      $or: [{ clientTxId }, { _id: clientTxId }],
    }).lean();

    if (existingTx) {
      const accounts = await getAccountsInternal();
      return res.status(200).json({
        transaction: formatTransaction(existingTx),
        updatedAccounts: accounts,
        idempotentReplay: true,
      });
    }

    const targetAccount = await AccountModel.findById(validated.accountId).lean();
    if (!targetAccount) {
      return res.status(404).json({ error: 'Selected account not found' });
    }

    const id = clientTxId;
    const date = validated.date ? new Date(validated.date) : new Date();

    // 2. Compute balance & daily stats adjustments
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

    // 3. Atomic MongoDB $inc update on account
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
      { new: true }
    );

    // 4. Create transaction
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

    res.status(201).json({
      transaction: createdTx,
      updatedAccounts,
    });
  } catch (err) {
    next(err);
  }
};

export const deleteTransaction = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const txToDelete = await TransactionModel.findById(id).lean();
    if (!txToDelete) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Revert account balance & statistics
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
    res.json({ deletedId: id, updatedAccounts });
  } catch (err) {
    next(err);
  }
};
