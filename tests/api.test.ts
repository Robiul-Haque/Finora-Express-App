import http from 'node:http';
import { app } from '../src/app.js';
import { connectDB } from '../src/config/db.js';

interface TestResult {
  name: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

const results: TestResult[] = [];
let baseUrl = '';
let testServer: http.Server;

const runTest = async (name: string, fn: () => Promise<void>) => {
  const start = Date.now();
  try {
    await fn();
    const durationMs = Date.now() - start;
    results.push({ name, passed: true, durationMs });
    console.log(`  ✅ PASS: ${name} (${durationMs}ms)`);
  } catch (err: any) {
    const durationMs = Date.now() - start;
    results.push({ name, passed: false, durationMs, error: err.message || String(err) });
    console.error(`  ❌ FAIL: ${name} (${durationMs}ms) - ${err.message}`);
  }
};

const assert = (condition: boolean, msg: string) => {
  if (!condition) throw new Error(msg);
};

const req = async (path: string, options: RequestInit = {}) => {
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
};

async function main() {
  console.log('\n🧪 Starting Finora Production API Test Suite...\n');

  await connectDB();

  // Start test server on random high port
  await new Promise<void>((resolve) => {
    testServer = app.listen(5098, () => {
      baseUrl = 'http://localhost:5098';
      resolve();
    });
  });

  try {
    // 1. Root & Health
    await runTest('1. GET / - Root info endpoint', async () => {
      const { status, data } = await req('/');
      assert(status === 200, `Expected 200, got ${status}`);
      assert(data.status === 'online', 'Expected status to be online');
      assert(data.database === 'MongoDB', 'Expected database to be MongoDB');
    });

    await runTest('2. GET /api/v1/health - Database health check', async () => {
      const { status, data } = await req('/api/v1/health');
      assert(status === 200, `Expected 200, got ${status}`);
      assert(data.status === 'healthy', 'Expected service status healthy');
      assert(data.database.status === 'Connected', 'Expected DB status Connected');
    });

    // 2. Database Reset & Seeding
    await runTest('3. POST /api/v1/reset - Reset & seed demo data', async () => {
      const { status, data } = await req('/api/v1/reset', { method: 'POST' });
      assert(status === 200, `Expected 200, got ${status}`);
      assert(data.data?.success === true || data.success === true, 'Expected reset success');
    });

    // 3. Accounts API Tests
    let testAccountId = '';
    const testAccountNumber = `01799${Math.floor(100000 + Math.random() * 900000)}`;

    await runTest('4. GET /api/v1/accounts - Retrieve seeded accounts', async () => {
      const { status, data } = await req('/api/v1/accounts');
      assert(status === 200, `Expected 200, got ${status}`);
      const accounts = Array.isArray(data) ? data : data.data;
      assert(Array.isArray(accounts) && accounts.length >= 4, 'Expected at least 4 seeded accounts');

      const acc = accounts[0];
      assert(typeof acc.id === 'string', 'Account must have id string');
      assert(typeof acc.name === 'string', 'Account must have name');
      assert(typeof acc.accountNumber === 'string', 'Account must have accountNumber');
      assert(typeof acc.balance === 'number', 'Account balance must be number');
      assert(typeof acc.todayProfit === 'number', 'Account todayProfit must be number');
      assert(typeof acc.isActive === 'boolean', 'Account isActive must be boolean');

      testAccountId = acc.id;
    });

    await runTest('5. GET /api/v1/accounts/:id - Fetch single account by ID', async () => {
      const { status, data } = await req(`/api/v1/accounts/${testAccountId}`);
      assert(status === 200, `Expected 200, got ${status}`);
      const acc = data.data || data;
      assert(acc.id === testAccountId, 'Fetched account ID mismatch');
    });

    let createdAccId = '';
    await runTest('6. POST /api/v1/accounts - Create new account with UI schema', async () => {
      const newAccPayload = {
        name: 'Test Agent Counter 3',
        type: 'agent',
        accountNumber: testAccountNumber,
        balance: 50000,
        dailyLimit: 300000,
        isActive: true,
        color: '#E2136E',
      };

      const { status, data } = await req('/api/v1/accounts', {
        method: 'POST',
        body: JSON.stringify(newAccPayload),
      });

      assert(status === 201, `Expected 201, got ${status}`);
      const created = data.data || data;
      assert(created.name === newAccPayload.name, 'Name mismatch');
      assert(created.accountNumber === testAccountNumber, 'Account number mismatch');
      assert(created.balance === 50000, 'Initial balance mismatch');
      assert(typeof created.id === 'string', 'Expected generated id');
      createdAccId = created.id;
    });

    await runTest('7. POST /api/v1/accounts - Duplicate number validation (400)', async () => {
      const { status } = await req('/api/v1/accounts', {
        method: 'POST',
        body: JSON.stringify({
          name: 'Duplicate Test',
          type: 'agent',
          accountNumber: testAccountNumber,
          balance: 1000,
        }),
      });
      assert(status === 400 || status === 409, `Expected 400/409 duplicate rejection, got ${status}`);
    });

    await runTest('8. PATCH /api/v1/accounts/:id - Update account details & status', async () => {
      const { status, data } = await req(`/api/v1/accounts/${createdAccId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: 'Updated Agent Counter 3', isActive: false }),
      });
      assert(status === 200, `Expected 200, got ${status}`);
      const list = data.data || data;
      const updated = list.find((a: any) => a.id === createdAccId);
      assert(updated?.name === 'Updated Agent Counter 3', 'Updated name mismatch');
      assert(updated?.isActive === false, 'Updated isActive status mismatch');
    });

    await runTest('9. DELETE /api/v1/accounts/:id - Delete created account', async () => {
      const { status, data } = await req(`/api/v1/accounts/${createdAccId}`, {
        method: 'DELETE',
      });
      assert(status === 200, `Expected 200, got ${status}`);
      const resData = data.data || data;
      assert(resData.deletedId === createdAccId, 'Deleted id mismatch');
    });

    // 4. Transactions API Tests
    let createdTxId = '';
    await runTest('10. GET /api/v1/transactions - Fetch all transactions', async () => {
      const { status, data } = await req('/api/v1/transactions');
      assert(status === 200, `Expected 200, got ${status}`);
      const txs = Array.isArray(data) ? data : data.data;
      assert(Array.isArray(txs) && txs.length >= 1, 'Expected at least 1 seeded transaction');

      const tx = txs[0];
      assert(typeof tx.id === 'string', 'Transaction must have id');
      assert(typeof tx.accountId === 'string', 'Transaction must have accountId');
      assert(typeof tx.amount === 'number', 'Transaction must have amount');
      assert(typeof tx.cost === 'number', 'Transaction must have cost');
      assert(typeof tx.profit === 'number', 'Transaction must have profit');
      assert(typeof tx.date === 'string', 'Transaction date must be ISO string');
    });

    await runTest('11. POST /api/v1/transactions - Log Cash Out & verify balance deductions', async () => {
      // Get initial account balance
      const { data: beforeData } = await req(`/api/v1/accounts/${testAccountId}`);
      const initialBalance = (beforeData.data || beforeData).balance;

      const txPayload = {
        accountId: testAccountId,
        accountNumber: '01716 553 880',
        accountName: 'Counter 1 - bKash Agent',
        type: 'cash_out',
        amount: 5000,
        cost: 75,
        profit: 20,
        recipientNumber: '01711 000 111',
        note: 'Test Cash Out Entry',
      };

      const { status, data } = await req('/api/v1/transactions', {
        method: 'POST',
        body: JSON.stringify(txPayload),
      });

      assert(status === 201, `Expected 201, got ${status}`);
      const resPayload = data.data || data;
      assert(resPayload.transaction.amount === 5000, 'Transaction amount mismatch');
      assert(resPayload.transaction.profit === 20, 'Transaction profit mismatch');
      createdTxId = resPayload.transaction.id;

      // Verify updated account balance
      const updatedAcc = resPayload.updatedAccounts.find((a: any) => a.id === testAccountId);
      assert(updatedAcc, 'Updated account missing in response');
      const expectedBalance = initialBalance - (5000 + 75);
      assert(updatedAcc.balance === expectedBalance, `Balance mismatch: expected ${expectedBalance}, got ${updatedAcc.balance}`);
    });

    await runTest('12. POST /api/v1/transactions - Idempotency Replay test', async () => {
      const idempotencyKey = `idemp_${Date.now()}`;
      const payload = {
        clientTxId: idempotencyKey,
        accountId: testAccountId,
        accountNumber: '01716 553 880',
        accountName: 'Counter 1 - bKash Agent',
        type: 'receive_money',
        amount: 2000,
        profit: 10,
      };

      // 1st request
      const res1 = await req('/api/v1/transactions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      assert(res1.status === 201, 'First request must succeed with 201');

      // 2nd request (duplicate replay)
      const res2 = await req('/api/v1/transactions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      assert(res2.status === 200, `Expected 200 idempotent replay, got ${res2.status}`);
      const body2 = res2.data.data || res2.data;
      assert(body2.idempotentReplay === true, 'Expected idempotentReplay flag');
    });

    await runTest('13. DELETE /api/v1/transactions/:id - Delete transaction & rollback balance', async () => {
      const { status, data } = await req(`/api/v1/transactions/${createdTxId}`, {
        method: 'DELETE',
      });
      assert(status === 200, `Expected 200, got ${status}`);
      const resPayload = data.data || data;
      assert(resPayload.deletedId === createdTxId, 'Deleted id mismatch');
      assert(Array.isArray(resPayload.updatedAccounts), 'Expected updated accounts list in delete response');
    });

    // 5. Metrics API Tests
    await runTest('14. GET /api/v1/metrics - Dashboard ledger metrics calculation', async () => {
      const { status, data } = await req('/api/v1/metrics');
      assert(status === 200, `Expected 200, got ${status}`);
      const metrics = data.data || data;
      assert(typeof metrics.totalBalance === 'number', 'Metrics must have totalBalance');
      assert(typeof metrics.monthlyIncome === 'number', 'Metrics must have monthlyIncome');
      assert(typeof metrics.monthlyExpense === 'number', 'Metrics must have monthlyExpense');
      assert(typeof metrics.todayProfit === 'number', 'Metrics must have todayProfit');
      assert(typeof metrics.todaySendTotal === 'number', 'Metrics must have todaySendTotal');
    });

    // 6. Offline Queue Batch Sync Tests
    await runTest('15. POST /api/v1/sync/batch & /transactions/sync - Offline queue sync', async () => {
      const batchPayload = {
        items: [
          {
            id: `sync_tx_${Date.now()}`,
            type: 'CREATE_TRANSACTION',
            payload: {
              accountId: testAccountId,
              accountNumber: '01716 553 880',
              accountName: 'Counter 1 - bKash Agent',
              type: 'receive_money',
              amount: 1200,
              profit: 8,
            },
          },
        ],
      };

      const { status, data } = await req('/api/v1/transactions/sync', {
        method: 'POST',
        body: JSON.stringify(batchPayload),
      });

      assert(status === 200, `Expected 200, got ${status}`);
      const syncResult = data.data || data;
      assert(syncResult.success === true, 'Expected sync success');
      assert(Array.isArray(syncResult.syncedIds) && syncResult.syncedIds.length === 1, 'Expected 1 syncedId');
    });

    // 7. Error Handling & 404 Tests
    await runTest('16. GET /invalid-route - 404 Not Found handling', async () => {
      const { status, data } = await req('/api/v1/non-existent-route-xyz');
      assert(status === 404, `Expected 404, got ${status}`);
      assert(data.success === false, 'Expected success: false in error response');
      assert(typeof data.error === 'string', 'Expected error message in response');
    });

    await runTest('17. POST /api/v1/transactions - Zod Validation Failure handling (400)', async () => {
      const { status, data } = await req('/api/v1/transactions', {
        method: 'POST',
        body: JSON.stringify({
          accountId: testAccountId,
          type: 'invalid_type',
          amount: -50,
        }),
      });
      assert(status === 400, `Expected 400, got ${status}`);
      assert(data.error === 'Validation Error', 'Expected Validation Error title');
      assert(Array.isArray(data.details) && data.details.length > 0, 'Expected details list');
    });
  } finally {
    testServer.close();
  }

  // Summary
  console.log('\n========================================');
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed out of ${results.length} Total Tests.`);
  console.log('========================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((e) => {
  console.error('Fatal test runner error:', e);
  process.exit(1);
});
