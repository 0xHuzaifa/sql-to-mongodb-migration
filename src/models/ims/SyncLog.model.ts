// src/models/SyncLog.model.ts

import mongoose, { Schema, Document } from 'mongoose';

export interface ISyncLog extends Document {
  syncId: string;
  vendorId: string;
  startTime: Date;
  endTime?: Date;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  fetchedItems: number;
  validRecords: number;
  invalidRecords: number;
  created: number;
  updated: number;
  skipped: number;
  errorsMessage: string[];
  attempts: number;
  rowsProcessed: number;
  rowsTotal: number;
  progressPercent: number;
}

const SyncLogSchema = new Schema({
  syncId: { type: String, required: true, unique: true, index: true },
  vendorId: { type: String, required: true, index: true },
  startTime: { type: Date, required: true },
  endTime: Date,
  status: { type: String, enum: ['PENDING', 'SUCCESS', 'FAILED'], default: 'PENDING' },
  fetchedItems: { type: Number, default: 0 },
  validRecords: { type: Number, default: 0 },
  invalidRecords: { type: Number, default: 0 },
  created: { type: Number, default: 0 },
  updated: { type: Number, default: 0 },
  skipped: { type: Number, default: 0 },
  errorsMessage: [String],
  attempts: { type: Number, default: 1 },
  rowsProcessed: { type: Number, default: 0 },
  rowsTotal: { type: Number, default: 0 },
  progressPercent: { type: Number, default: 0 },
}, { timestamps: true });

export default mongoose.model<ISyncLog>('SyncLog', SyncLogSchema);