import { Request, Response } from 'express';
import { AccountModel } from '../models/Account.js';
import { TransactionModel } from '../models/Transaction.js';
import { createAccountSchema, updateAccountSchema } from '../validators/index.js';
import { Account } from '../types/index.js';
import { catchAsync } from '../utils/catchAsync.js';
import { sendResponse } from '../utils/sendResponse.js';
import { AppError } from '../utils/AppError.js';
import { formatAccount } from '../utils/formatters.js';

export const getAccountsInternal = async (): Promise<Account[]> => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const startOfMonth = new Date(startOfToday.getFullYear(), startOfToday.getMonth(), 1);

  const [docs, txStats] = await Promise.all([
    AccountModel.find().sort({ createdAt: -1 }).lean(),
    TransactionModel.aggregate([
      { $match: { date: { $gte: startOfMonth } } },
      {
        $group: {
          _id: '$accountId',
          todaySend: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ['$date', startOfToday] },
                    { $in: ['$type', ['sm', 'send_money', 'send', 'co', 'cash_out', 'b2b']] }
                  ]
                },
                '$amount',
                0
              ]
            }
          },
          todayReceive: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $gte: ['$date', startOfToday] },
                    { $in: ['$type', ['recev', 'receive_money', 'receive', 'cash_in']] }
                  ]
                },
                '$amount',
                0
              ]
            }
          },
          todayProfit: {
            $sum: {
              $cond: [
                { $gte: ['$date', startOfToday] },
                { $ifNull: ['$profit', '$margin'] },
                0
              ]
            }
          },
          monthlyLimitUsed: {
            $sum: {
              $cond: [
                { $in: ['$type', ['sm', 'send_money', 'send']] },
                '$amount',
                0
              ]
            }
          }
        }
      }
    ])
  ]);

  const statsMap = new Map<string, any>(txStats.map((s) => [String(s._id), s]));

  return docs.map((doc) => {
    const stats = statsMap.get(String(doc._id));
    const mLimit = typeof doc.monthlyLimit === 'number' ? Math.min(doc.monthlyLimit, 300000) : 300000;
    const mUsed = stats ? stats.monthlyLimitUsed : (typeof doc.monthlyLimitUsed === 'number' ? doc.monthlyLimitUsed : 0);
    const tSend = stats ? stats.todaySend : (typeof doc.todaySend === 'number' ? doc.todaySend : 0);
    const tReceive = stats ? stats.todayReceive : (typeof doc.todayReceive === 'number' ? doc.todayReceive : 0);
    const tProfit = stats ? stats.todayProfit : (typeof doc.todayProfit === 'number' ? doc.todayProfit : 0);

    return formatAccount({
      ...doc,
      monthlyLimit: mLimit,
      monthlyLimitUsed: mUsed,
      remainingLimit: Math.max(0, mLimit - mUsed),
      dailyLimit: typeof doc.dailyLimit === 'number' ? Math.min(doc.dailyLimit, 50000) : 50000,
      todaySend: tSend,
      todayReceive: tReceive,
      todayProfit: tProfit,
    });
  });
};

export const getAccounts = catchAsync(async (req: Request, res: Response) => {
  const accounts = await getAccountsInternal();
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
  const monthlyLimit = typeof validated.monthlyLimit === 'number' ? Math.min(validated.monthlyLimit, 300000) : 300000;
  const monthlyLimitUsed = typeof validated.monthlyLimitUsed === 'number' ? validated.monthlyLimitUsed : 0;
  const remainingLimit = typeof validated.remainingLimit === 'number'
    ? validated.remainingLimit
    : Math.max(0, monthlyLimit - monthlyLimitUsed);

  const newDoc = await AccountModel.create({
    _id: id,
    name: validated.name,
    type: validated.type,
    accountNumber: validated.accountNumber,
    shortCode: validated.shortCode || undefined,
    carrier: validated.carrier || undefined,
    balance: typeof validated.balance === 'number' ? validated.balance : 0,
    monthlyLimit,
    monthlyLimitUsed,
    remainingLimit,
    dailyLimit: typeof validated.dailyLimit === 'number' ? Math.min(validated.dailyLimit, 50000) : 50000,
    todaySend: 0,
    todayReceive: 0,
    todayProfit: 0,
    totalMargin: typeof validated.totalMargin === 'number' ? validated.totalMargin : 0,
    isActive: validated.isActive !== undefined ? validated.isActive : true,
    color: validated.color || undefined,
    group: validated.group || undefined,
    isHighlighted: Boolean(validated.isHighlighted),
    highlightColor: validated.highlightColor || undefined,
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
  if (validated.shortCode !== undefined) updateData.shortCode = validated.shortCode || undefined;
  if (validated.carrier !== undefined) updateData.carrier = validated.carrier || undefined;
  if (validated.balance !== undefined) updateData.balance = validated.balance;
  if (validated.monthlyLimit !== undefined) updateData.monthlyLimit = Math.min(validated.monthlyLimit, 300000);
  if (validated.monthlyLimitUsed !== undefined) updateData.monthlyLimitUsed = validated.monthlyLimitUsed;
  if (validated.remainingLimit !== undefined) updateData.remainingLimit = validated.remainingLimit;
  if (validated.dailyLimit !== undefined) updateData.dailyLimit = Math.min(validated.dailyLimit, 50000);
  if (validated.todaySend !== undefined) updateData.todaySend = validated.todaySend;
  if (validated.todayReceive !== undefined) updateData.todayReceive = validated.todayReceive;
  if (validated.todayProfit !== undefined) updateData.todayProfit = validated.todayProfit;
  if (validated.totalMargin !== undefined) updateData.totalMargin = validated.totalMargin;
  if (validated.isActive !== undefined) updateData.isActive = validated.isActive;
  if (validated.color !== undefined) updateData.color = validated.color || undefined;
  if (validated.group !== undefined) updateData.group = validated.group || undefined;
  if (validated.isHighlighted !== undefined) updateData.isHighlighted = validated.isHighlighted;
  if (validated.highlightColor !== undefined) updateData.highlightColor = validated.highlightColor || undefined;

  // Auto calculate remainingLimit if monthlyLimit or monthlyLimitUsed changed without explicit remainingLimit
  if ((validated.monthlyLimit !== undefined || validated.monthlyLimitUsed !== undefined) && validated.remainingLimit === undefined) {
    const existing = await AccountModel.findById(id).lean();
    if (existing) {
      const mLimit = validated.monthlyLimit ?? existing.monthlyLimit ?? 300000;
      const mUsed = validated.monthlyLimitUsed ?? existing.monthlyLimitUsed ?? 0;
      updateData.remainingLimit = Math.max(0, mLimit - mUsed);
    }
  }

  const updated = await AccountModel.findByIdAndUpdate(
    id,
    { $set: updateData },
    { returnDocument: 'after', runValidators: true }
  ).lean();

  if (!updated) {
    throw new AppError('Account not found', 404);
  }

  const accounts = await getAccountsInternal();
  sendResponse(res, { statusCode: 200, data: accounts });
});

export const deleteAccount = catchAsync(async (req: Request, res: Response) => {
  const { id } = req.params;
  const deleted = await AccountModel.findByIdAndDelete(id).lean();

  if (!deleted) {
    throw new AppError('Account not found', 404);
  }

  // Cascade delete: delete all associated transactions
  await TransactionModel.deleteMany({ accountId: id });

  sendResponse(res, { statusCode: 200, data: { success: true, deletedId: id } });
});
