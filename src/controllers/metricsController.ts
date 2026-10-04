import { Request, Response } from 'express';
import { AccountModel } from '../models/Account.js';
import { TransactionModel } from '../models/Transaction.js';
import { LedgerMetrics } from '../types/index.js';
import { seedDatabase } from '../seeder/seeder.js';
import { catchAsync } from '../utils/catchAsync.js';
import { sendResponse } from '../utils/sendResponse.js';

import { INFLOW_TYPES, OUTFLOW_TYPES } from '../utils/transactionHelpers.js';

export const getMetrics = catchAsync(async (req: Request, res: Response) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Parallel aggregation execution
  const [accountAgg, monthlyAgg] = await Promise.all([
    AccountModel.aggregate([
      {
        $group: {
          _id: null,
          totalBalance: {
            $sum: { $cond: [{ $eq: ['$isActive', true] }, '$balance', 0] },
          },
          totalMonthlyLimit: {
            $sum: { $cond: [{ $eq: ['$isActive', true] }, { $ifNull: ['$monthlyLimit', 300000] }, 0] },
          },
          totalMonthlyLimitUsed: {
            $sum: { $cond: [{ $eq: ['$isActive', true] }, { $ifNull: ['$monthlyLimitUsed', '$todaySend'] }, 0] },
          },
          todayProfit: { $sum: '$todayProfit' },
          todaySendTotal: { $sum: '$todaySend' },
          activeAccountsCount: {
            $sum: { $cond: [{ $eq: ['$isActive', true] }, 1, 0] },
          },
        },
      },
    ]),
    TransactionModel.aggregate([
      {
        $match: { date: { $gte: startOfMonth } },
      },
      {
        $group: {
          _id: null,
          monthlyIncome: {
            $sum: {
              $cond: [{ $in: ['$type', INFLOW_TYPES] }, '$amount', 0],
            },
          },
          monthlyExpense: {
            $sum: {
              $cond: [
                { $in: ['$type', OUTFLOW_TYPES] },
                { $add: ['$amount', { $ifNull: ['$cost', 0] }] },
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const accountStats = accountAgg[0] || {
    totalBalance: 0,
    totalMonthlyLimit: 0,
    totalMonthlyLimitUsed: 0,
    todayProfit: 0,
    todaySendTotal: 0,
    activeAccountsCount: 0,
  };

  const monthlyStats = monthlyAgg[0] || {
    monthlyIncome: 0,
    monthlyExpense: 0,
  };

  const totalMonthlyLimit = accountStats.totalMonthlyLimit || 0;
  const totalMonthlyLimitUsed = accountStats.totalMonthlyLimitUsed || 0;
  const totalLimitRemaining = Math.max(0, totalMonthlyLimit - totalMonthlyLimitUsed);

  const metrics: LedgerMetrics = {
    totalBalance: accountStats.totalBalance || 0,
    totalMonthlyLimit,
    totalMonthlyLimitUsed,
    totalLimitRemaining,
    monthlyIncome: monthlyStats.monthlyIncome || 0,
    monthlyExpense: monthlyStats.monthlyExpense || 0,
    todayProfit: accountStats.todayProfit || 0,
    todaySendTotal: accountStats.todaySendTotal || 0,
    balanceGrowthPercentage: 4.8,
    activeAccountsCount: accountStats.activeAccountsCount || 0,
  };

  sendResponse(res, { statusCode: 200, data: metrics });
});

export const resetDatabase = catchAsync(async (req: Request, res: Response) => {
  await Promise.all([
    TransactionModel.deleteMany({}),
    AccountModel.deleteMany({}),
  ]);

  await seedDatabase();

  sendResponse(res, {
    statusCode: 200,
    data: { success: true, message: 'Database reset to initial bKash demo ledger in MongoDB.' },
  });
});