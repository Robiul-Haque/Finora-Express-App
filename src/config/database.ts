import dns from 'node:dns';
import mongoose from 'mongoose';
import { config } from './index.js';

// Resolve MongoDB Atlas SRV records in Windows/local ISP environments if not serverless
if (!process.env.VERCEL) {
  try {
    dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
  } catch {
    // Ignore if custom DNS server override is restricted
  }
}

let isInitialized = false;
let cachedPromise: Promise<typeof mongoose> | null = null;

export const connectDB = async (): Promise<typeof mongoose> => {
  // 1. Connection already active
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  // 2. Return existing in-flight connection promise to prevent duplicate connections
  if (cachedPromise) {
    return cachedPromise;
  }

  // 3. Initiate cached connection
  cachedPromise = mongoose
    .connect(config.mongoUri, {
      maxPoolSize: 20,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      autoIndex: true, // Ensure production indexes are properly registered on MongoDB Atlas
    })
    .then((conn) => {
      if (!isInitialized) {
        isInitialized = true;
        console.log('\x1b[32m🍃 MongoDB Connected Successfully.\x1b[0m');

        mongoose.connection.on('error', (err) => {
          console.error('\x1b[31m🍃 MongoDB Connection Error:\x1b[0m', err);
        });

        mongoose.connection.on('disconnected', () => {
          console.warn('\x1b[33m🍃 MongoDB Disconnected.\x1b[0m');
          cachedPromise = null;
        });

        mongoose.connection.on('reconnected', () => {
          console.log('\x1b[32m🍃 MongoDB Reconnected Successfully.\x1b[0m');
        });
      }
      return conn;
    })
    .catch((error) => {
      cachedPromise = null;
      console.error('❌ Failed to connect to MongoDB:', error);
      throw error;
    });

  return cachedPromise;
};

export const disconnectDB = async (): Promise<void> => {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  console.log('🍃 MongoDB connection closed.');
};
