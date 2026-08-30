import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { connectDB, disconnectDB } from './db/connection.js';
import { seedDatabase } from './db/seed.js';
import { apiRouter } from './routes/api.js';
import { errorHandler } from './middleware/errorHandler.js';

const app = express();

// Trust reverse proxy (for Render, Fly.io, Railway, Nginx, AWS, Cloudflare)
app.set('trust proxy', 1);

// Production Security Headers
app.use(helmet());

// Response Compression (Gzip/Brotli) for high throughput & low bandwidth
app.use(compression());

// Dynamic & Scalable CORS configuration
app.use(
  cors({
    origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((s) => s.trim()),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key'],
    credentials: true,
  })
);

// High-performance Rate Limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api', limiter);

// Request Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Response time header & development logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    res.setHeader('X-Response-Time', `${duration}ms`);
    if (config.nodeEnv === 'development') {
      console.log(`[${req.method}] ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// API Routes
app.use('/api/v1', apiRouter);

// Root Health / Info Endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Finora bKash Ledger Production API',
    version: '1.0.0',
    database: 'MongoDB',
    status: 'online',
    docs: '/api/v1/health',
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
});

// Global Error Handling Middleware
app.use(errorHandler);

// Server Lifecycle Startup
let server: any;

async function startServer() {
  try {
    // 1. Connect to MongoDB
    await connectDB();

    // 2. Seed default demo data if empty
    await seedDatabase();

    // 3. Start Express HTTP Server
    server = app.listen(config.port, () => {
      console.log(`🚀 Finora Backend running on port ${config.port} [${config.nodeEnv}]`);
      console.log(`📡 API Base: http://localhost:${config.port}/api/v1`);
    });
  } catch (err) {
    console.error('❌ Failed to bootstrap application:', err);
    process.exit(1);
  }
}

startServer();

// Graceful Shutdown on termination signals
async function gracefulShutdown(signal: string) {
  console.log(`\n🛑 ${signal} received. Initiating graceful shutdown...`);
  if (server) {
    server.close(async () => {
      console.log('🔒 HTTP server closed.');
      await disconnectDB();
      console.log('✅ Application gracefully stopped.');
      process.exit(0);
    });
  } else {
    await disconnectDB();
    process.exit(0);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception thrown:', err);
  gracefulShutdown('uncaughtException');
});
