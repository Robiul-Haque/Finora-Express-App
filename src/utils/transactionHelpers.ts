import { TransactionType } from '../types/index.js';

export const OUTFLOW_TYPES: TransactionType[] = [
  'send_money',
  'cash_out',
  'b2b',
  'sm',
  'co',
  'send',
];

export const INFLOW_TYPES: TransactionType[] = [
  'receive_money',
  'cash_in',
  'recev',
  'receive',
];

export const normalizeTransactionType = (rawType: string): TransactionType => {
  if (!rawType) return 'send_money';
  const t = rawType.toLowerCase().trim().replace(/[\s-]+/g, '_');

  // Cash out (Cash Out / co)
  if (t === 'cash_out' || t === 'co' || t === 'cashout') {
    return 'cash_out';
  }

  // Send money (Send Money / sm / send)
  if (t === 'send_money' || t === 'send' || t === 'sm' || t === 'sendmoney') {
    return 'send_money';
  }

  // Receive money (Receive Money / Recived Money / recev / receive / cash_in)
  if (
    t === 'receive_money' ||
    t === 'receive' ||
    t === 'recev' ||
    t === 'cash_in' ||
    t === 'recived_money' ||
    t === 'received_money' ||
    t === 'recived' ||
    t === 'received'
  ) {
    return 'receive_money';
  }

  // Adjustment
  if (t === 'adjustment' || t === 'adj') {
    return 'adjustment';
  }

  // B2B
  if (t === 'b2b') {
    return 'b2b';
  }

  return rawType as TransactionType;
};

export const isOutflowType = (type: string): boolean => {
  const norm = normalizeTransactionType(type);
  return OUTFLOW_TYPES.includes(norm as TransactionType);
};

export const isInflowType = (type: string): boolean => {
  const norm = normalizeTransactionType(type);
  return INFLOW_TYPES.includes(norm as TransactionType);
};

export interface BalanceDeltas {
  balanceDelta: number;
  sendDelta: number;
  receiveDelta: number;
  profitDelta: number;
}

export const calculateDeltas = (
  type: string,
  amount: number,
  cost: number = 0,
  profit: number = 0
): BalanceDeltas => {
  const safeAmount = typeof amount === 'number' && !isNaN(amount) ? amount : 0;
  const safeCost = typeof cost === 'number' && !isNaN(cost) ? cost : 0;
  const safeProfit = typeof profit === 'number' && !isNaN(profit) ? profit : 0;

  let balanceDelta = 0;
  let sendDelta = 0;
  let receiveDelta = 0;

  if (isOutflowType(type)) {
    balanceDelta = -(safeAmount + safeCost);
    sendDelta = safeAmount;
  } else if (isInflowType(type)) {
    balanceDelta = safeAmount;
    receiveDelta = safeAmount;
  } else if (type === 'adjustment') {
    balanceDelta = safeAmount;
  }

  return {
    balanceDelta,
    sendDelta,
    receiveDelta,
    profitDelta: safeProfit,
  };
};
