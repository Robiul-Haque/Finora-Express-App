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
      enum: ['cash_out', 'cash_in', 'send_money', 'receive_money', 'b2b', 'adjustment'],
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0.01,
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
      min: 0,
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
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    toJSON: {
      transform: (_, ret: any) => {
        ret.id = ret._id;
        delete ret._id;
        if (ret.date instanceof Date) {
          ret.date = ret.date.toISOString();
        }
        if (ret.createdAt instanceof Date) {
          ret.createdAt = ret.createdAt.toISOString();
        }
        return ret;
      },
    },
    toObject: {
      transform: (_, ret: any) => {
        ret.id = ret._id;
        delete ret._id;
        if (ret.date instanceof Date) {
          ret.date = ret.date.toISOString();
        }
        if (ret.createdAt instanceof Date) {
          ret.createdAt = ret.createdAt.toISOString();
        }
        return ret;
      },
    },
  }
);

// High Performance Compound Indexes for Scale (Sub-millisecond query execution)
transactionSchema.index({ accountId: 1, date: -1 });
transactionSchema.index({ date: -1 });
transactionSchema.index({ type: 1, date: -1 });
transactionSchema.index({ accountId: 1, type: 1, date: -1 });

// Text / String search index for fast querying
transactionSchema.index({
  accountNumber: 'text',
  accountName: 'text',
  recipientNumber: 'text',
  senderNumber: 'text',
  note: 'text',
});

export const TransactionModel: Model<ITransaction> =
  mongoose.models.Transaction || mongoose.model<ITransaction>('Transaction', transactionSchema);
