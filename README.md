# Finora bKash Ledger - Production-Grade MongoDB Backend API

High-performance, scalable, ACID-compliant REST API backend for the Finora bKash Mobile Expo App powered by **Node.js, Express, TypeScript, and MongoDB (Mongoose)**.

---

## 🚀 Key Features

- **TypeScript + Node.js (ESM)**: Strict type safety matching the Finora mobile client interfaces.
- **MongoDB + Mongoose with Connection Pooling**: Designed for high concurrency and massive transaction volume (`maxPoolSize: 50`, `minPoolSize: 10`).
- **High-Performance Compound Indexing**: Sub-millisecond queries on millions of ledger transactions (`{ accountId: 1, date: -1 }`, `{ date: -1 }`, `{ type: 1, date: -1 }`, `{ clientTxId: 1 }`).
- **Aggregation Pipelines for Metrics**: Fast, single-pass calculation for balances, income, expense, and daily profits.
- **Atomic Balance & Daily Limit Updates**: Uses MongoDB's atomic `$inc` operators to prevent race conditions across concurrent operations.
- **Idempotency Support (`X-Idempotency-Key` / `clientTxId`)**: Safe offline-to-online replay without duplicate transaction insertions.
- **Offline Batch Sync Endpoint**: Direct endpoint (`/api/v1/sync/batch`) for the mobile app's offline queue sync.
- **Production Hardened**: Response compression (gzip), Helmet security headers, CORS origin management, reverse proxy trust (`trust proxy`), and Zod request validation.
- **Graceful Shutdown**: Safe termination handling for HTTP server and database connections.

---

## 🛠️ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Create a `.env` file from `.env.example`:
```env
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb://127.0.0.1:27017/finora
CORS_ORIGIN=*
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=240
```

### 3. Run in Development Mode
```bash
npm run dev
```
The server will start on: **`http://localhost:5000/api/v1`**

### 4. Build & Run for Production
```bash
npm run build
npm start
```

---

## 📡 API Endpoints

### 🩺 Health & Diagnostics
- `GET /` - Root service info
- `GET /api/v1/health` - Health status, database connection state, and uptime

### 💼 Accounts
- `GET /api/v1/accounts` - Fetch all bKash business accounts
- `GET /api/v1/accounts/:id` - Fetch single account details
- `POST /api/v1/accounts` - Create new bKash account line
- `PATCH /api/v1/accounts/:id` - Update an account
- `DELETE /api/v1/accounts/:id` - Delete an account line

### 📝 Transactions
- `GET /api/v1/transactions` - Fetch transactions (Supports filtering: `?accountId=&type=&dateRange=&sortBy=&searchQuery=&limit=&offset=`)
- `POST /api/v1/transactions` - Create a transaction (Accepts `clientTxId` or `X-Idempotency-Key`)
- `DELETE /api/v1/transactions/:id` - Delete a transaction (Reverts account balance and daily stats)

### 📊 Metrics & Analytics
- `GET /api/v1/metrics` - Fetch real-time balance, today's profit, monthly income/expense

### 🔄 Offline Sync
- `POST /api/v1/sync/batch` - Process batch offline synchronization queue items

### 🔁 Reset Demo Data
- `POST /api/v1/reset` - Reset database back to initial bKash demo ledger

---

## 📱 Connecting to the Mobile Expo App

To connect the mobile Expo app to this real backend server:
1. In `src/services/api/ledgerApi.ts`:
   - Set `API_CONFIG.BASE_URL = 'http://<YOUR_LOCAL_IP>:5000/api/v1'` (e.g. `http://192.168.1.100:5000/api/v1`)
   - Set `API_CONFIG.USE_MOCK_STORAGE = false`
