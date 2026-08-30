import mongoose, { Schema, Model } from 'mongoose';
import { AccountType, SyncStatus } from '../types/index.js';

export interface IAccount {
  _id: string;
  name: string;
  type: AccountType;
  accountNumber: string;
  balance: number;
  dailyLimit: number;
  todaySend: number;
  todayReceive: number;
  todayProfit: number;
  isActive: boolean;
  color?: string;
  syncStatus?: SyncStatus;
  createdAt?: Date;
}

const accountSchema = new Schema<IAccount>(
  {
    _id: {
      type: String,
      default: () => `acc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
    },
    type: {
      type: String,
      enum: ['agent', 'merchant', 'personal', 'corporate', 'bkash'],
      required: true,
      index: true,
    },
    accountNumber: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
    },
    dailyLimit: {
      type: Number,
      required: true,
      default: 300000,
    },
    todaySend: {
      type: Number,
      required: true,
      default: 0,
    },
    todayReceive: {
      type: Number,
      required: true,
      default: 0,
    },
    todayProfit: {
      type: Number,
      required: true,
      default: 0,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    color: {
      type: String,
      default: undefined,
    },
    syncStatus: {
      type: String,
      enum: ['synced', 'pending', 'failed'],
      default: 'synced',
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false,
    toJSON: {
      transform: (_, ret: any) => {
        ret.id = ret._id;
        delete ret._id;
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
        if (ret.createdAt instanceof Date) {
          ret.createdAt = ret.createdAt.toISOString();
        }
        return ret;
      },
    },
  }
);

// Compound indexes for rapid lookup and list sorting
accountSchema.index({ isActive: 1, createdAt: -1 });

export const AccountModel: Model<IAccount> =
  mongoose.models.Account || mongoose.model<IAccount>('Account', accountSchema);
