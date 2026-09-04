import { Account, Transaction } from '../types/index.js';

export const formatAccount = (doc: any): Account => ({
  id: doc._id ? String(doc._id) : doc.id,
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
});

export const formatTransaction = (doc: any): Transaction => ({
  id: doc._id ? String(doc._id) : doc.id,
  clientTxId: doc.clientTxId,
  accountId: doc.accountId,
  accountNumber: doc.accountNumber,
  accountName: doc.accountName,
  type: doc.type,
  amount: doc.amount,
  margin: typeof doc.margin === 'number' ? doc.margin : (typeof doc.profit === 'number' ? doc.profit : 0),
  runningBalance: typeof doc.runningBalance === 'number' ? doc.runningBalance : undefined,
  counterparty: doc.counterparty || undefined,
  recipientNumber: doc.recipientNumber || undefined,
  senderNumber: doc.senderNumber || undefined,
  cost: typeof doc.cost === 'number' ? doc.cost : 0,
  profit: typeof doc.profit === 'number' ? doc.profit : 0,
  date: doc.date instanceof Date ? doc.date.toISOString() : doc.date,
  note: doc.note || undefined,
  syncStatus: doc.syncStatus,
  retryCount: doc.retryCount,
  lastError: doc.lastError || undefined,
});
