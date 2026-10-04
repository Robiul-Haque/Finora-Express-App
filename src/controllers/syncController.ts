import { Request, Response } from 'express';
import { TransactionModel } from '../models/Transaction.js';
import { AccountModel } from '../models/Account.js';
import { batchSyncSchema } from '../validators/index.js';
import { catchAsync } from '../utils/catchAsync.js';
import { sendResponse } from '../utils/sendResponse.js';
import { calculateDeltas } from '../utils/transactionHelpers.js';

export const processBatchSync = catchAsync(async (req: Request, res: Response) => {
  const validated = batchSyncSchema.parse(req.body);
  let successCount = 0;
  let failedCount = 0;
  const syncedIds: string[] = [];
  const failedIds: string[] = [];
  const errors: Array<{ id: string; error: string }> = [];

  for (const item of validated.items) {
    try {
      if (item.type === 'CREATE_TRANSACTION') {
        const txData = item.payload;
        const clientTxId = item.clientTxId || txData.clientTxId || item.id;

        const existing = await TransactionModel.findOne({
          $or: [{ clientTxId }, { _id: clientTxId }],
        }).lean();

        if (existing) {
          successCount++;
          syncedIds.push(item.id);
          continue;
        }

        const targetAccount = await AccountModel.findById(txData.accountId).lean();
        if (!targetAccount) {
          failedCount++;
          failedIds.push(item.id);
          errors.push({ id: item.id, error: 'Target account not found' });
          continue;
        }

        const id = clientTxId;
        const date = txData.date ? new Date(txData.date) : new Date();
        const profitDelta = txData.profit !== undefined && txData.profit > 0
          ? txData.profit
          : (txData.margin !== undefined ? txData.margin : 0);

        const deltas = calculateDeltas(txData.type, txData.amount, txData.cost, profitDelta);

        await AccountModel.findByIdAndUpdate(txData.accountId, {
          $inc: {
            balance: deltas.balanceDelta,
            todaySend: deltas.sendDelta,
            todayReceive: deltas.receiveDelta,
            todayProfit: deltas.profitDelta,
          },
        });

        await TransactionModel.create({
          _id: id,
          clientTxId,
          accountId: txData.accountId,
          accountNumber: txData.accountNumber,
          accountName: txData.accountName,
          type: txData.type,
          amount: txData.amount,
          margin: profitDelta,
          runningBalance: txData.runningBalance,
          counterparty: (txData.counterparty || txData.recipientNumber || txData.senderNumber) || undefined,
          recipientNumber: txData.recipientNumber || undefined,
          senderNumber: txData.senderNumber || undefined,
          cost: txData.cost || 0,
          profit: profitDelta,
          date,
          note: txData.note || undefined,
          syncStatus: 'synced',
        });

        successCount++;
        syncedIds.push(item.id);
      } else if (item.type === 'UPDATE_TRANSACTION') {
        const txData = item.payload?.updates || item.payload;
        const txId = item.payload?.id || txData.id || txData.clientTxId || item.id;
        const existing = await TransactionModel.findOne({
          $or: [{ _id: txId }, { clientTxId: txId }],
        });

        if (existing) {
          const oldProfit = typeof existing.profit === 'number'
            ? existing.profit
            : (typeof existing.margin === 'number' ? existing.margin : 0);
          const oldDeltas = calculateDeltas(existing.type, existing.amount, existing.cost, oldProfit);

          const newType = txData.type || existing.type;
          const newAmount = txData.amount !== undefined ? txData.amount : existing.amount;
          const newCost = txData.cost !== undefined ? txData.cost : (existing.cost || 0);
          const newProfit = txData.profit !== undefined
            ? txData.profit
            : (txData.margin !== undefined ? txData.margin : oldProfit);
          const newDeltas = calculateDeltas(newType, newAmount, newCost, newProfit);

          if (txData.note !== undefined) existing.note = txData.note || undefined;
          if (txData.counterparty !== undefined) existing.counterparty = txData.counterparty || undefined;
          if (txData.recipientNumber !== undefined) existing.recipientNumber = txData.recipientNumber || undefined;
          if (txData.senderNumber !== undefined) existing.senderNumber = txData.senderNumber || undefined;
          if (txData.amount !== undefined) existing.amount = txData.amount;
          if (txData.cost !== undefined) existing.cost = txData.cost;
          if (txData.profit !== undefined) existing.profit = txData.profit;
          if (txData.margin !== undefined) existing.margin = txData.margin;
          if (txData.type !== undefined) existing.type = txData.type;
          if (txData.date !== undefined) existing.date = new Date(txData.date);

          await existing.save();

          const balanceDiff = newDeltas.balanceDelta - oldDeltas.balanceDelta;
          const sendDiff = newDeltas.sendDelta - oldDeltas.sendDelta;
          const receiveDiff = newDeltas.receiveDelta - oldDeltas.receiveDelta;
          const profitDiff = newDeltas.profitDelta - oldDeltas.profitDelta;

          if (balanceDiff !== 0 || sendDiff !== 0 || receiveDiff !== 0 || profitDiff !== 0) {
            await AccountModel.findByIdAndUpdate(existing.accountId, {
              $inc: {
                balance: balanceDiff,
                todaySend: sendDiff,
                todayReceive: receiveDiff,
                todayProfit: profitDiff,
              },
            });
          }
        }
        successCount++;
        syncedIds.push(item.id);
      } else if (item.type === 'DELETE_TRANSACTION') {
        const txId = item.payload?.id || item.payload?.clientTxId || item.id;
        const tx = await TransactionModel.findOne({
          $or: [{ _id: txId }, { clientTxId: txId }],
        }).lean();

        if (tx) {
          const profit = typeof tx.profit === 'number'
            ? tx.profit
            : (typeof tx.margin === 'number' ? tx.margin : 0);
          const deltas = calculateDeltas(tx.type, tx.amount, tx.cost, profit);

          await AccountModel.findByIdAndUpdate(tx.accountId, {
            $inc: {
              balance: -deltas.balanceDelta,
              todaySend: -deltas.sendDelta,
              todayReceive: -deltas.receiveDelta,
              todayProfit: -deltas.profitDelta,
            },
          });

          await TransactionModel.deleteOne({ _id: tx._id });
        }
        successCount++;
        syncedIds.push(item.id);
      } else if (item.type === 'CREATE_ACCOUNT') {
        const accData = item.payload;
        const accId = accData.id || item.id || `acc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const existingAcc = await AccountModel.findById(accId).lean();

        if (!existingAcc) {
          const monthlyLimit = typeof accData.monthlyLimit === 'number'
            ? accData.monthlyLimit
            : (typeof accData.dailyLimit === 'number' ? accData.dailyLimit : 300000);
          const monthlyLimitUsed = typeof accData.monthlyLimitUsed === 'number' ? accData.monthlyLimitUsed : 0;
          const remainingLimit = typeof accData.remainingLimit === 'number'
            ? accData.remainingLimit
            : Math.max(0, monthlyLimit - monthlyLimitUsed);

          await AccountModel.create({
            _id: accId,
            name: accData.name,
            type: accData.type || 'agent',
            accountNumber: accData.accountNumber,
            shortCode: accData.shortCode || undefined,
            carrier: accData.carrier || undefined,
            balance: accData.balance || 0,
            monthlyLimit,
            monthlyLimitUsed,
            remainingLimit,
            dailyLimit: typeof accData.dailyLimit === 'number' ? accData.dailyLimit : 300000,
            todaySend: accData.todaySend || 0,
            todayReceive: accData.todayReceive || 0,
            todayProfit: accData.todayProfit || 0,
            totalMargin: typeof accData.totalMargin === 'number' ? accData.totalMargin : 0,
            isActive: accData.isActive !== undefined ? accData.isActive : true,
            color: accData.color || undefined,
            group: accData.group || undefined,
            isHighlighted: Boolean(accData.isHighlighted),
            highlightColor: accData.highlightColor || undefined,
            syncStatus: 'synced',
          });
        }
        successCount++;
        syncedIds.push(item.id);
      } else if (item.type === 'DELETE_ACCOUNT') {
        const accId = item.payload?.id || item.id;
        await AccountModel.findByIdAndDelete(accId);
        await TransactionModel.deleteMany({ accountId: accId });
        successCount++;
        syncedIds.push(item.id);
      } else if (item.type === 'UPDATE_ACCOUNT') {
        const accData = item.payload?.updates || item.payload;
        const accId = item.payload?.id || accData.id || item.id;
        await AccountModel.findByIdAndUpdate(accId, { $set: accData });
        successCount++;
        syncedIds.push(item.id);
      }
    } catch (itemErr: any) {
      failedCount++;
      failedIds.push(item.id);
      errors.push({ id: item.id, error: itemErr.message || 'Sync operation failed' });
    }
  }

  sendResponse(res, {
    statusCode: 200,
    data: {
      success: true,
      processed: validated.items.length,
      successCount,
      failedCount,
      syncedIds,
      failedIds,
      errors,
    },
  });
});