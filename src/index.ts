import { app } from './app.js';
import { config } from './config/index.js';
import { connectDB, disconnectDB } from './config/db.js';
import { seedDatabase } from './seeder/seeder.js';

let server: any;

const startServer = async () => {
  try {
    await connectDB();
    await seedDatabase();

    server = app.listen(config.port, () => {
      console.log(`🚀 Finora Backend running on port ${config.port} [${config.nodeEnv}]`);
      console.log(`📡 API Base: http://localhost:${config.port}/api/v1`);
    });
  } catch (err) {
    console.error('❌ Failed to bootstrap application:', err);
  }
};

// Only run standalone HTTP server when not in serverless/Vercel environment
if (!process.env.VERCEL) {
  startServer();
}

const gracefulShutdown = async (signal: string) => {
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
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('🔥 Uncaught Exception thrown:', err);
});

export default app;
export { app };