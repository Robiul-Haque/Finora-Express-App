import { Router } from 'express';
import mongoose from 'mongoose';
import {
  getAccounts,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
} from '../controllers/accountsController.js';
import {
  getTransactions,
  createTransaction,
  deleteTransaction,
} from '../controllers/transactionsController.js';
import { getMetrics, resetDatabase } from '../controllers/metricsController.js';
import { processBatchSync } from '../controllers/syncController.js';

export const apiRouter = Router();

// Health Check
apiRouter.get('/health', (req, res) => {
  const dbStates = ['Disconnected', 'Connected', 'Connecting', 'Disconnecting'];
  const dbState = dbStates[mongoose.connection.readyState] || 'Unknown';

  res.json({
    status: mongoose.connection.readyState === 1 ? 'healthy' : 'degraded',
    service: 'Finora bKash Ledger API',
    database: {
      provider: 'MongoDB',
      status: dbState,
    },
    uptime: `${Math.floor(process.uptime())}s`,
    timestamp: new Date().toISOString(),
  });
});

// Accounts Routes
apiRouter.get('/accounts', getAccounts);
apiRouter.get('/accounts/:id', getAccountById);
apiRouter.post('/accounts', createAccount);
apiRouter.patch('/accounts/:id', updateAccount);
apiRouter.delete('/accounts/:id', deleteAccount);

// Transactions Routes
apiRouter.get('/transactions', getTransactions);
apiRouter.post('/transactions', createTransaction);
apiRouter.delete('/transactions/:id', deleteTransaction);

// Metrics & Offline Sync
apiRouter.get('/metrics', getMetrics);
apiRouter.post('/sync/batch', processBatchSync);
apiRouter.post('/transactions/sync', processBatchSync);
apiRouter.post('/reset', resetDatabase);
