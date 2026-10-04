import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { config } from './config/index.js';
import { connectDB } from './config/database.js';
import { apiRouter } from './routes/api.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { errorHandler } from './middleware/errorHandler.js';

export const app = express();

// Trust reverse proxy (Vercel, Cloudflare, Nginx, Railway)
app.set('trust proxy', 1);

// Production Security Headers & Compression
app.use(helmet());
app.use(compression());

// CORS configuration
app.use(
  cors({
    origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(',').map((s) => s.trim()),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key', 'Accept'],
    credentials: true,
  })
);

// Rate Limiter
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

// Development logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (config.nodeEnv === 'development') {
      const duration = Date.now() - start;
      console.log(`[${req.method}] ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    }
  });
  next();
});

// Auto-connect to DB on incoming requests (vital for Vercel serverless cold starts)
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

// API Routes
app.use('/api/v1', apiRouter);

// Root Info Endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Finora bKash Ledger API',
    version: '1.0.0',
    database: 'MongoDB',
    status: 'online',
    docs: '/api/v1/health',
  });
});

// 404 & Global Error Handlers
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
