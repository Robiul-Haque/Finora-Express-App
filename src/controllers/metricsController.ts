import { Request, Response, NextFunction } from 'express';
import { AccountModel } from '../models/Account.js';
import { TransactionModel } from '../models/Transaction.js';
import { LedgerMetrics } from '../types/index.js';
import { seedDatabase } from '../db/seed.js';

export const getMetrics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Parallel aggregation execution for sub-millisecond response
    const [accountAgg, monthlyAgg] = await Promise.all([
      AccountModel.aggregate([
        {
          $group: {
            _id: null,
            totalBalance: {
              $sum: { $cond: [{ $eq: ['$isActive', true] }, '$balance', 0] },
            },
            todayProfit: { $sum: '$todayProfit' },
            todaySendTotal: { $sum: '$todaySend' },
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
                $cond: [{ $in: ['$type', ['receive_money', 'cash_in']] }, '$amount', 0],
              },
            },
            monthlyExpense: {
              $sum: {
                $cond: [
                  { $in: ['$type', ['send_money', 'cash_out', 'b2b']] },
                  { $add: ['$amount', '$cost'] },
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
      todayProfit: 0,
      todaySendTotal: 0,
    };

    const monthlyStats = monthlyAgg[0] || {
      monthlyIncome: 0,
      monthlyExpense: 0,
    };

    const metrics: LedgerMetrics = {
      totalBalance: accountStats.totalBalance || 0,
      monthlyIncome: monthlyStats.monthlyIncome || 0,
      monthlyExpense: monthlyStats.monthlyExpense || 0,
      todayProfit: accountStats.todayProfit || 0,
      todaySendTotal: accountStats.todaySendTotal || 0,
      balanceGrowthPercentage: 2.4,
    };

    res.json(metrics);
  } catch (err) {
    next(err);
  }
};

export const resetDatabase = async (req: Request, res: Response, next: NextFunction) => {
  try {
    await Promise.all([
      TransactionModel.deleteMany({}),
      AccountModel.deleteMany({}),
    ]);

    await seedDatabase();

    res.json({ success: true, message: 'Database reset to initial bKash demo ledger in MongoDB.' });
  } catch (err) {
    next(err);
  }
};
