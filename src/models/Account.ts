import mongoose, { Schema, Model } from 'mongoose';
import { AccountType, SyncStatus } from '../types/index.js';

export interface IAccount {
  _id: string;
  name: string;
  type: AccountType;
  accountNumber: string;
  shortCode?: string;
  carrier?: string;
  balance: number;
  monthlyLimit: number;
  monthlyLimitUsed: number;
  remainingLimit: number;
  dailyLimit: number;
  todaySend: number;
  todayReceive: number;
  todayProfit: number;
  totalMargin?: number;
  isActive: boolean;
  color?: string;
  group?: string;
  isHighlighted?: boolean;
  highlightColor?: string;
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
    shortCode: {
      type: String,
      trim: true,
      default: undefined,
    },
    carrier: {
      type: String,
      enum: ['gp', 'banglalink', 'robi', 'airtel', 'teletalk', 'mfs'],
      default: undefined,
    },
    balance: {
      type: Number,
      required: true,
      default: 0,
    },
    monthlyLimit: {
      type: Number,
      required: true,
      default: 300000,
    },
    monthlyLimitUsed: {
      type: Number,
      required: true,
      default: 0,
    },
    remainingLimit: {
      type: Number,
      required: true,
      default: 300000,
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
    totalMargin: {
      type: Number,
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
    group: {
      type: String,
      default: undefined,
    },
    isHighlighted: {
      type: Boolean,
      default: false,
    },
    highlightColor: {
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
