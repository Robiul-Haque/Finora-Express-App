export type AccountType = 'agent' | 'merchant' | 'personal' | 'corporate' | 'bkash';

export type TransactionType = 'cash_out' | 'cash_in' | 'send_money' | 'receive_money' | 'b2b' | 'adjustment';

export type SyncStatus = 'synced' | 'pending' | 'failed';

export interface Account {
  id: string;
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
  createdAt: string;
  syncStatus?: SyncStatus;
}

export interface Transaction {
  id: string;
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
  date: string;
  note?: string;
  syncStatus?: SyncStatus;
  retryCount?: number;
  lastError?: string;
}

export interface LedgerMetrics {
  totalBalance: number;
  monthlyIncome: number;
  monthlyExpense: number;
  todayProfit: number;
  todaySendTotal: number;
  balanceGrowthPercentage: number;
}
