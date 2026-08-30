import dns from 'node:dns';
import mongoose from 'mongoose';
import { config } from '../config.js';

// Resolve SRV records reliably (prevents querySrv ECONNREFUSED on Windows/ISP DNS)
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {
  // ignore if not permitted
}

let isInitialized = false;

export async function connectDB(): Promise<typeof mongoose> {
  // If already connected, reuse existing mongoose connection (vital for Serverless/Vercel)
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  // If currently connecting, wait for it
  if (mongoose.connection.readyState === 2) {
    return new Promise((resolve, reject) => {
      mongoose.connection.once('connected', () => resolve(mongoose));
      mongoose.connection.once('error', (err) => reject(err));
    });
  }

  try {
    const conn = await mongoose.connect(config.mongoUri, {
      maxPoolSize: 20, // Concurrency pool
      minPoolSize: 1,  // Keep socket open
      serverSelectionTimeoutMS: 8000, // Timeout after 8s
      socketTimeoutMS: 45000,
      autoIndex: config.nodeEnv !== 'production',
    });

    if (!isInitialized) {
      isInitialized = true;
      console.log(`🍃 MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);

      mongoose.connection.on('error', (err) => {
        console.error('🍃 MongoDB Connection Error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('🍃 MongoDB Disconnected.');
      });

      mongoose.connection.on('reconnected', () => {
        console.log('🍃 MongoDB Reconnected successfully.');
      });
    }

    return conn;
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    throw error;
  }
}

export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  console.log('🍃 MongoDB connection closed.');
}
