import { AccountModel } from '../models/Account.js';
import { TransactionModel } from '../models/Transaction.js';

export async function seedDatabase(): Promise<void> {
  try {
    const accountCount = await AccountModel.countDocuments();
    if (accountCount > 0) {
      return; // Already seeded
    }

    const now = new Date();
    const yesterday = new Date(Date.now() - 86400000);

    const initialAccounts = [
      {
        _id: 'acc_1',
        name: 'Counter 1 - bKash Agent',
        type: 'agent',
        accountNumber: '01716 553 880',
        balance: 88500,
        dailyLimit: 300000,
        todaySend: 52000,
        todayReceive: 14000,
        todayProfit: 950,
        isActive: true,
        color: '#E2136E',
        createdAt: new Date(Date.now() - 30 * 86400000),
      },
      {
        _id: 'acc_2',
        name: 'Shop Merchant QR bKash',
        type: 'merchant',
        accountNumber: '01812 345 678',
        balance: 45200,
        dailyLimit: 500000,
        todaySend: 20000,
        todayReceive: 38000,
        todayProfit: 680,
        isActive: true,
        color: '#BE123C',
        createdAt: new Date(Date.now() - 20 * 86400000),
      },
      {
        _id: 'acc_3',
        name: 'Counter 2 - bKash Agent',
        type: 'agent',
        accountNumber: '01999 888 777',
        balance: 114500,
        dailyLimit: 300000,
        todaySend: 35000,
        todayReceive: 25000,
        todayProfit: 820,
        isActive: true,
        color: '#E2136E',
        createdAt: new Date(Date.now() - 10 * 86400000),
      },
      {
        _id: 'acc_4',
        name: 'Owner Personal bKash',
        type: 'personal',
        accountNumber: '01644 555 123',
        balance: 18500,
        dailyLimit: 200000,
        todaySend: 0,
        todayReceive: 0,
        todayProfit: 0,
        isActive: true,
        color: '#9D174D',
        createdAt: new Date(Date.now() - 60 * 86400000),
      },
    ];

    const initialTransactions = [
      {
        _id: 'tx_1',
        clientTxId: 'tx_1',
        accountId: 'acc_1',
        accountNumber: '01716 553 880',
        accountName: 'Counter 1 - bKash Agent',
        type: 'cash_out',
        amount: 15000,
        recipientNumber: '01712 345 678',
        senderNumber: null,
        cost: 225,
        profit: 62,
        date: new Date(now.getTime() - 20 * 60000),
        note: 'Customer Cash Out via Agent PIN',
        syncStatus: 'synced',
      },
      {
        _id: 'tx_2',
        clientTxId: 'tx_2',
        accountId: 'acc_1',
        accountNumber: '01716 553 880',
        accountName: 'Counter 1 - bKash Agent',
        type: 'receive_money',
        amount: 8000,
        recipientNumber: null,
        senderNumber: '01888 111 222',
        cost: 0,
        profit: 32,
        date: new Date(now.getTime() - 90 * 60000),
        note: 'Customer Cash In transaction',
        syncStatus: 'synced',
      },
      {
        _id: 'tx_3',
        clientTxId: 'tx_3',
        accountId: 'acc_2',
        accountNumber: '01812 345 678',
        accountName: 'Shop Merchant QR bKash',
        type: 'receive_money',
        amount: 25000,
        recipientNumber: null,
        senderNumber: '01777 999 000',
        cost: 0,
        profit: 150,
        date: new Date(now.getTime() - 140 * 60000),
        note: 'bKash Merchant QR payment from buyer',
        syncStatus: 'synced',
      },
      {
        _id: 'tx_4',
        clientTxId: 'tx_4',
        accountId: 'acc_3',
        accountNumber: '01999 888 777',
        accountName: 'Counter 2 - bKash Agent',
        type: 'send_money',
        amount: 20000,
        recipientNumber: '01611 222 333',
        senderNumber: null,
        cost: 100,
        profit: 80,
        date: new Date(now.getTime() - 260 * 60000),
        note: 'bKash Agent B2B Float transfer',
        syncStatus: 'synced',
      },
      {
        _id: 'tx_5',
        clientTxId: 'tx_5',
        accountId: 'acc_1',
        accountNumber: '01716 553 880',
        accountName: 'Counter 1 - bKash Agent',
        type: 'cash_out',
        amount: 25000,
        recipientNumber: '01912 333 444',
        senderNumber: null,
        cost: 375,
        profit: 102,
        date: yesterday,
        note: 'Customer large cash out #8410',
        syncStatus: 'synced',
      },
    ];

    await AccountModel.insertMany(initialAccounts);
    await TransactionModel.insertMany(initialTransactions);

    console.log('🍃 Database seeded successfully with initial bKash accounts & records in MongoDB.');
  } catch (error) {
    console.error('Error seeding MongoDB:', error);
  }
}
