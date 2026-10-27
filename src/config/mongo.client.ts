import mongoose from 'mongoose';
import { config } from './env.config';

let isConnected = false;

export async function connectMongo(): Promise<typeof mongoose> {
  if (isConnected && mongoose.connection.readyState === 1) {
    return mongoose;
  }

  try {
    const conn = await mongoose.connect(config.mongo.uri, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 120000,
    });
    isConnected = true;
    console.log(`[Mongo Client] Connected successfully to MongoDB (${config.mongo.uri})`);
    return conn;
  } catch (err) {
    console.error('[Mongo Client] Error connecting to MongoDB:', err);
    throw err;
  }
}

export async function closeMongo(): Promise<void> {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    console.log('[Mongo Client] MongoDB connection closed.');
  }
}
