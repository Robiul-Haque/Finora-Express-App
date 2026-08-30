import { Request, Response, NextFunction } from 'express';
import { TransactionModel } from '../models/Transaction.js';
import { AccountModel } from '../models/Account.js';
import { batchSyncSchema } from '../validators/index.js';

export const processBatchSync = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = batchSyncSchema.parse(req.body);
    let successCount = 0;
    let failedCount = 0;
    const errors: Array<{ id: string; error: string }> = [];

    for (const item of validated.items) {
      try {
        if (item.type === 'CREATE_TRANSACTION') {
          const txData = item.payload;
          const clientTxId = item.clientTxId || item.id;

          // Check duplicate
          const existing = await TransactionModel.findOne({
            $or: [{ clientTxId }, { _id: clientTxId }],
          }).lean();

          if (existing) {
            successCount++;
            continue;
          }

          const targetAccount = await AccountModel.findById(txData.accountId).lean();
          if (!targetAccount) {
            failedCount++;
            errors.push({ id: item.id, error: 'Target account not found' });
            continue;
          }

          const id = clientTxId;
          const date = txData.date ? new Date(txData.date) : new Date();

          let balanceDelta = 0;
          let sendDelta = 0;
          let receiveDelta = 0;
          const profitDelta = txData.profit || 0;

          if (txData.type === 'send_money' || txData.type === 'cash_out' || txData.type === 'b2b') {
            balanceDelta = -(txData.amount + (txData.cost || 0));
            sendDelta = txData.amount;
          } else if (txData.type === 'receive_money' || txData.type === 'cash_in') {
            balanceDelta = txData.amount;
            receiveDelta = txData.amount;
          } else if (txData.type === 'adjustment') {
            balanceDelta = txData.amount;
          }

          await AccountModel.findByIdAndUpdate(txData.accountId, {
            $inc: {
              balance: balanceDelta,
              todaySend: sendDelta,
              todayReceive: receiveDelta,
              todayProfit: profitDelta,
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
            recipientNumber: txData.recipientNumber || null,
            senderNumber: txData.senderNumber || null,
            cost: txData.cost || 0,
            profit: txData.profit || 0,
            date,
            note: txData.note || null,
            syncStatus: 'synced',
          });

          successCount++;
        } else if (item.type === 'DELETE_TRANSACTION') {
          const txId = item.payload?.id || item.id;
          const tx = await TransactionModel.findById(txId).lean();
          if (tx) {
            let balanceDelta = 0;
            let sendDelta = 0;
            let receiveDelta = 0;
            const profitDelta = -(tx.profit || 0);

            if (tx.type === 'send_money' || tx.type === 'cash_out' || tx.type === 'b2b') {
              balanceDelta = +(tx.amount + tx.cost);
              sendDelta = -tx.amount;
            } else if (tx.type === 'receive_money' || tx.type === 'cash_in') {
              balanceDelta = -tx.amount;
              receiveDelta = -tx.amount;
            } else if (tx.type === 'adjustment') {
              balanceDelta = -tx.amount;
            }

            await AccountModel.findByIdAndUpdate(tx.accountId, {
              $inc: {
                balance: balanceDelta,
                todaySend: sendDelta,
                todayReceive: receiveDelta,
                todayProfit: profitDelta,
              },
            });

            await TransactionModel.findByIdAndDelete(txId);
          }
          successCount++;
        } else if (item.type === 'UPDATE_ACCOUNT') {
          const accData = item.payload;
          const accId = accData.id || item.id;
          await AccountModel.findByIdAndUpdate(accId, { $set: accData });
          successCount++;
        }
      } catch (itemErr: any) {
        failedCount++;
        errors.push({ id: item.id, error: itemErr.message || 'Sync operation failed' });
      }
    }

    res.json({
      success: true,
      processed: validated.items.length,
      successCount,
      failedCount,
      errors,
    });
  } catch (err) {
    next(err);
  }
};
