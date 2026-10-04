export type AccountCarrier = 'gp' | 'banglalink' | 'robi' | 'airtel' | 'teletalk' | 'mfs';

export type AccountType = 'agent' | 'merchant' | 'personal' | 'corporate' | 'bkash';

export type TransactionType =
  | 'cash_out'
  | 'cash_in'
  | 'send_money'
  | 'receive_money'
  | 'b2b'
  | 'adjustment'
  | 'recev'
  | 'sm'
  | 'co'
  | 'send'
  | 'receive';

export type SyncStatus = 'synced' | 'pending' | 'failed';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  accountNumber: string;
  shortCode?: string;
  carrier?: AccountCarrier;
  balance: number;
  monthlyLimit: number;
  monthlyLimitUsed: number;
  remainingLimit: number;
  dailyLimit?: number;
  todaySend: number;
  todayReceive: number;
  todayProfit: number;
  totalMargin?: number;
  isActive: boolean;
  color?: string;
  group?: 'primary' | 'secondary' | string;
  isHighlighted?: boolean;
  highlightColor?: string;
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
  margin?: number;
  runningBalance?: number;
  counterparty?: string;
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
  totalMonthlyLimit: number;
  totalMonthlyLimitUsed: number;
  totalLimitRemaining: number;
  monthlyIncome: number;
  monthlyExpense: number;
  todayProfit: number;
  todaySendTotal: number;
  balanceGrowthPercentage: number;
  activeAccountsCount: number;
}
