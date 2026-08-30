import dns from 'node:dns';
import mongoose from 'mongoose';
import { config } from './index.js';

// Resolve MongoDB Atlas SRV records reliably in ISP / Windows environments
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch {
  // Ignore if custom DNS server override is restricted
}

let isInitialized = false;

export const connectDB = async (): Promise<typeof mongoose> => {
  // Connection caching for Serverless environments (Vercel)
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (mongoose.connection.readyState === 2) {
    return new Promise((resolve, reject) => {
      mongoose.connection.once('connected', () => resolve(mongoose));
      mongoose.connection.once('error', (err) => reject(err));
    });
  }

  try {
    const conn = await mongoose.connect(config.mongoUri, {
      maxPoolSize: 20,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 8000,
      socketTimeoutMS: 45000,
      autoIndex: config.nodeEnv !== 'production',
    });

    if (!isInitialized) {
      isInitialized = true;
      console.log(`\x1b[32m🍃 MongoDB Connected Successfully:\x1b[0m \x1b[1;32m${conn.connection.host}/${conn.connection.name}\x1b[0m`);

      mongoose.connection.on('error', (err) => {
        console.error('\x1b[31m🍃 MongoDB Connection Error:\x1b[0m', err);
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('\x1b[33m🍃 MongoDB Disconnected.\x1b[0m');
      });

      mongoose.connection.on('reconnected', () => {
        console.log('\x1b[32m🍃 MongoDB Reconnected Successfully.\x1b[0m');
      });
    }

    return conn;
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    throw error;
  }
};

export const disconnectDB = async (): Promise<void> => {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  console.log('🍃 MongoDB connection closed.');
};
