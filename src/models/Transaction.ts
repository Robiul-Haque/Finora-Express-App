import mongoose, { Schema, Model } from 'mongoose';
import { TransactionType, SyncStatus } from '../types/index.js';

export interface ITransaction {
  _id: string;
  clientTxId?: string;
  accountId: string;
  accountNumber: string;
  accountName: string;
  type: TransactionType;
  amount: number;
  margin?: number;
  runningBalance?: number;
  counterparty?: string;
  recipientNumber?: string;
  senderNumber?: string;
  cost: number;
  profit: number;
  date: Date;
  note?: string;
  syncStatus: SyncStatus;
  retryCount?: number;
  lastError?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const transactionSchema = new Schema<ITransaction>(
  {
    _id: {
      type: String,
      default: () => `tx_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    },
    clientTxId: {
      type: String,
      sparse: true,
      unique: true,
      index: true,
    },
    accountId: {
      type: String,
      required: true,
      ref: 'Account',
      index: true,
    },
    accountNumber: {
      type: String,
      required: true,
      trim: true,
    },
    accountName: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: [
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
      ],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    margin: {
      type: Number,
      default: 0,
    },
    runningBalance: {
      type: Number,
      default: undefined,
    },
    counterparty: {
      type: String,
      trim: true,
      default: undefined,
    },
    recipientNumber: {
      type: String,
      trim: true,
      default: undefined,
    },
    senderNumber: {
      type: String,
      trim: true,
      default: undefined,
    },
    cost: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    profit: {
      type: Number,
      required: true,
      default: 0,
    },
    date: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    note: {
      type: String,
      trim: true,
      default: undefined,
    },
    syncStatus: {
      type: String,
      enum: ['synced', 'pending', 'failed'],
      default: 'synced',
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    lastError: {
      type: String,
      default: undefined,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

transactionSchema.index({ accountId: 1, date: -1 });
transactionSchema.index({ type: 1, date: -1 });

export const TransactionModel: Model<ITransaction> =
  mongoose.models.Transaction || mongoose.model<ITransaction>('Transaction', transactionSchema);
