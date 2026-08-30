import { Request, Response } from 'express';
import { AccountModel } from '../models/Account.js';
import { createAccountSchema, updateAccountSchema } from '../validators/index.js';
import { Account } from '../types/index.js';
import { catchAsync } from '../utils/catchAsync.js';
import { sendResponse } from '../utils/sendResponse.js';
import { AppError } from '../utils/AppError.js';
import { formatAccount } from '../utils/formatters.js';

export const getAccounts = catchAsync(async (req: Request, res: Response) => {
  const docs = await AccountModel.find().sort({ createdAt: -1 }).lean();
  const accounts = docs.map(formatAccount);
  sendResponse(res, { statusCode: 200, data: accounts });
});

export const getAccountById = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const doc = await AccountModel.findById(id).lean();

  if (!doc) {
    throw new AppError('Account not found', 404);
  }

  sendResponse(res, { statusCode: 200, data: formatAccount(doc) });
});

export const createAccount = catchAsync(async (req: Request, res: Response) => {
  const validated = createAccountSchema.parse(req.body);
  const existing = await AccountModel.findOne({ accountNumber: validated.accountNumber }).lean();

  if (existing) {
    throw new AppError('An account with this bKash number already exists.', 400);
  }

  const id = `acc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const newDoc = await AccountModel.create({
    _id: id,
    name: validated.name,
    type: validated.type,
    accountNumber: validated.accountNumber,
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
  sendResponse(res, { statusCode: 201, data: formatAccount(accountObj) });
});

export const updateAccount = catchAsync(async (req: Request, res: Response) => {
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
    { returnDocument: 'after', runValidators: true }
  ).lean();

  if (!updated) {
    throw new AppError('Account not found', 404);
  }

  const allDocs = await AccountModel.find().sort({ createdAt: -1 }).lean();
  const accounts = allDocs.map(formatAccount);

  sendResponse(res, { statusCode: 200, data: accounts });
});

export const deleteAccount = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = await AccountModel.findByIdAndDelete(id).lean();

  if (!deleted) {
    throw new AppError('Account not found', 404);
  }

  sendResponse(res, { statusCode: 200, data: { success: true, deletedId: id } });
});

export const getAccountsInternal = async (): Promise<Account[]> => {
  const docs = await AccountModel.find().sort({ createdAt: -1 }).lean();
  return docs.map(formatAccount);
};