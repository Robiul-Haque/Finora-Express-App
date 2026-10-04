import { z } from 'zod';
import { normalizeTransactionType } from '../utils/transactionHelpers.js';

const allowedCarriers = ['gp', 'banglalink', 'robi', 'airtel', 'teletalk', 'mfs'] as const;

export const createAccountSchema = z.object({
  name: z.string().trim().min(2, 'Account name must be at least 2 characters'),
  type: z.enum(['agent', 'merchant', 'personal', 'corporate', 'bkash'], {
    errorMap: () => ({ message: 'Invalid bKash account type' }),
  }),
  accountNumber: z.string().trim().min(10, 'Valid bKash number required (at least 10 digits)'),
  shortCode: z.string().trim().optional().nullable(),
  carrier: z.enum(allowedCarriers).optional().nullable(),
  balance: z.number().default(0),
  monthlyLimit: z.number().min(1000).default(300000),
  monthlyLimitUsed: z.number().default(0),
  remainingLimit: z.number().default(300000),
  dailyLimit: z.number().min(1000).default(300000),
  totalMargin: z.number().default(0),
  isActive: z.boolean().default(true),
  color: z.string().optional().nullable(),
  group: z.string().optional().nullable(),
  isHighlighted: z.boolean().default(false),
  highlightColor: z.string().optional().nullable(),
});

export const updateAccountSchema = z.object({
  name: z.string().trim().min(2).optional(),
  type: z.enum(['agent', 'merchant', 'personal', 'corporate', 'bkash']).optional(),
  accountNumber: z.string().trim().min(10).optional(),
  shortCode: z.string().trim().optional().nullable(),
  carrier: z.enum(allowedCarriers).optional().nullable(),
  balance: z.number().optional(),
  monthlyLimit: z.number().min(1000).optional(),
  monthlyLimitUsed: z.number().optional(),
  remainingLimit: z.number().optional(),
  dailyLimit: z.number().min(1000).optional(),
  todaySend: z.number().optional(),
  todayReceive: z.number().optional(),
  todayProfit: z.number().optional(),
  totalMargin: z.number().optional(),
  isActive: z.boolean().optional(),
  color: z.string().optional().nullable(),
  group: z.string().optional().nullable(),
  isHighlighted: z.boolean().optional(),
  highlightColor: z.string().optional().nullable(),
});

const allowedTxTypes = [
  'cash_out',
  'cash_in',
  'send_money',
  'receive_money',
  'b2b',
  'adjustment',
  'recev',
  'sm',
  'co',
  'send',
  'receive',
] as const;

export const createTransactionSchema = z.object({
  clientTxId: z.string().optional(),
  accountId: z.string().min(1, 'Account ID is required'),
  accountNumber: z.string().min(1, 'Account number is required'),
  accountName: z.string().min(1, 'Account name is required'),
  type: z.preprocess(
    (val) => (typeof val === 'string' ? normalizeTransactionType(val) : val),
    z.enum(allowedTxTypes, {
      errorMap: () => ({ message: 'Invalid transaction type. Allowed: Cash Out, Send Money, Receive Money, Adjustment' }),
    })
  ),
  amount: z.number().positive('Amount is required and must be greater than 0'),
  margin: z.number().optional(),
  runningBalance: z.number().optional(),
  counterparty: z.string().trim().optional().nullable(),
  recipientNumber: z.string().trim().optional().nullable(),
  senderNumber: z.string().trim().optional().nullable(),
  cost: z.number().min(0, 'Cost/fee cannot be negative').default(0),
  profit: z.number().min(0, 'Profit/commission cannot be negative').default(0),
  date: z.string().optional(),
  note: z.string().trim().optional().nullable(),
});

export const updateTransactionSchema = z.object({
  accountId: z.string().optional(),
  accountNumber: z.string().optional(),
  accountName: z.string().optional(),
  type: z.preprocess(
    (val) => (typeof val === 'string' ? normalizeTransactionType(val) : val),
    z.enum(allowedTxTypes).optional()
  ),
  amount: z.number().positive().optional(),
  margin: z.number().optional(),
  runningBalance: z.number().optional(),
  counterparty: z.string().trim().optional().nullable(),
  recipientNumber: z.string().trim().optional().nullable(),
  senderNumber: z.string().trim().optional().nullable(),
  cost: z.number().min(0).optional(),
  profit: z.number().min(0).optional(),
  date: z.string().optional(),
  note: z.string().trim().optional().nullable(),
});

export const getTransactionsQuerySchema = z.object({
  accountId: z.string().optional(),
  type: z.string().optional(),
  dateRange: z.enum(['today', 'yesterday', 'this_week', 'this_month', 'all']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z.enum(['newest', 'oldest', 'amount_high', 'amount_low', 'profit_high']).optional(),
  searchQuery: z.string().optional(),
  limit: z.coerce.number().min(1).max(1000).default(500),
  offset: z.coerce.number().min(0).default(0),
});

export const batchSyncSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      clientTxId: z.string().optional(),
      type: z.enum(['CREATE_TRANSACTION', 'UPDATE_TRANSACTION', 'DELETE_TRANSACTION', 'CREATE_ACCOUNT', 'UPDATE_ACCOUNT', 'DELETE_ACCOUNT']),
      payload: z.any(),
      createdAt: z.string().optional(),
    })
  ),
});
