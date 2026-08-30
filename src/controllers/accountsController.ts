import { Request, Response, NextFunction } from 'express';
import { AccountModel } from '../models/Account.js';
import { createAccountSchema, updateAccountSchema } from '../validators/index.js';
import { Account } from '../types/index.js';

function formatAccount(doc: any): Account {
  return {
    id: doc._id ? doc._id.toString() : doc.id,
    name: doc.name,
    type: doc.type,
    accountNumber: doc.accountNumber,
    balance: typeof doc.balance === 'number' ? doc.balance : 0,
    dailyLimit: typeof doc.dailyLimit === 'number' ? doc.dailyLimit : 300000,
    todaySend: typeof doc.todaySend === 'number' ? doc.todaySend : 0,
    todayReceive: typeof doc.todayReceive === 'number' ? doc.todayReceive : 0,
    todayProfit: typeof doc.todayProfit === 'number' ? doc.todayProfit : 0,
    isActive: Boolean(doc.isActive),
    color: doc.color || undefined,
    createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : doc.createdAt,
    syncStatus: doc.syncStatus,
  };
}

export const getAccounts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const docs = await AccountModel.find().sort({ createdAt: -1 }).lean();
    const accounts: Account[] = docs.map(formatAccount);
    res.json(accounts);
  } catch (err) {
    next(err);
  }
};

export const getAccountById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const doc = await AccountModel.findById(id).lean();

    if (!doc) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json(formatAccount(doc));
  } catch (err) {
    next(err);
  }
};

export const createAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = createAccountSchema.parse(req.body);
    const existing = await AccountModel.findOne({ accountNumber: validated.accountNumber }).lean();
    if (existing) {
      return res.status(400).json({ error: 'An account with this bKash number already exists.' });
    }

    const id = `acc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newDoc = await AccountModel.create({
      _id: id,
      name: validated.name,
      type: validated.type,
      accountNumber: validated.accountNumber, // Exact string preserved with leading 0s
      balance: typeof validated.balance === 'number' ? validated.balance : 0,
      dailyLimit: typeof validated.dailyLimit === 'number' ? validated.dailyLimit : 300000,
      todaySend: 0,
      todayReceive: 0,
      todayProfit: 0,
      isActive: validated.isActive !== undefined ? validated.isActive : true,
      color: validated.color || undefined,
      syncStatus: 'synced',
    });

    const accountObj = newDoc.toObject ? newDoc.toObject() : newDoc;
    res.status(201).json(formatAccount(accountObj));
  } catch (err) {
    next(err);
  }
};

export const updateAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const validated = updateAccountSchema.parse(req.body);

    const updateData: Record<string, any> = {};
    if (validated.name !== undefined) updateData.name = validated.name;
    if (validated.type !== undefined) updateData.type = validated.type;
    if (validated.accountNumber !== undefined) updateData.accountNumber = validated.accountNumber;
    if (validated.balance !== undefined) updateData.balance = validated.balance;
    if (validated.dailyLimit !== undefined) updateData.dailyLimit = validated.dailyLimit;
    if (validated.todaySend !== undefined) updateData.todaySend = validated.todaySend;
    if (validated.todayReceive !== undefined) updateData.todayReceive = validated.todayReceive;
    if (validated.todayProfit !== undefined) updateData.todayProfit = validated.todayProfit;
    if (validated.isActive !== undefined) updateData.isActive = validated.isActive;
    if (validated.color !== undefined) updateData.color = validated.color || undefined;

    const updated = await AccountModel.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ error: 'Account not found' });
    }

    const allDocs = await AccountModel.find().sort({ createdAt: -1 }).lean();
    const accounts = allDocs.map(formatAccount);

    res.json(accounts);
  } catch (err) {
    next(err);
  }
};

export const deleteAccount = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const deleted = await AccountModel.findByIdAndDelete(id).lean();

    if (!deleted) {
      return res.status(404).json({ error: 'Account not found' });
    }

    res.json({ success: true, deletedId: id });
  } catch (err) {
    next(err);
  }
};

export async function getAccountsInternal(): Promise<Account[]> {
  const docs = await AccountModel.find().sort({ createdAt: -1 }).lean();
  return docs.map(formatAccount);
}
