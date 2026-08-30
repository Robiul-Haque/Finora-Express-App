import dns from 'node:dns';
import mongoose from 'mongoose';
import { config } from '../config.js';

// Resolve SRV records reliably (prevents querySrv ECONNREFUSED on Windows/ISP DNS)
try {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
} catch (e) {
  // ignore if not permitted
}

let isConnected = false;

export async function connectDB(): Promise<typeof mongoose> {
  if (isConnected) {
    return mongoose;
  }

  try {
    const conn = await mongoose.connect(config.mongoUri, {
      maxPoolSize: 50, // Maintain up to 50 concurrent socket connections
      minPoolSize: 10, // Keep at least 10 sockets open for instant responses
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of hanging
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
      autoIndex: config.nodeEnv !== 'production', // Build indexes in dev, manual/cached in prod
    });

    isConnected = true;
    console.log(`🍃 MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);

    mongoose.connection.on('error', (err) => {
      console.error('🍃 MongoDB Connection Error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('🍃 MongoDB Disconnected. Attempting reconnection...');
      isConnected = false;
    });

    mongoose.connection.on('reconnected', () => {
      console.log('🍃 MongoDB Reconnected successfully.');
      isConnected = true;
    });

    return conn;
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
}

export async function disconnectDB(): Promise<void> {
  if (!isConnected) return;
  await mongoose.disconnect();
  isConnected = false;
  console.log('🍃 MongoDB connection closed.');
}
