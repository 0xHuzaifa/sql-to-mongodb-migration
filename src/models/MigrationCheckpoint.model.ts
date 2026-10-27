import mongoose, { Schema, Document } from 'mongoose';

export interface IMigrationCheckpoint extends Document {
  phaseKey: string;          // e.g., 'PHASE_4_3_POS_TKT_HIST'
  lastBusDat: Date | null;   // For keyset pagination on PS_TKT_HIST.BUS_DAT
  lastDocId: string | null;  // For keyset pagination on PS_TKT_HIST.DOC_ID / ITEM_NO
  processedRows: number;
  totalEstimatedRows?: number;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  errorMessage?: string;
  updatedAt: Date;
}

const MigrationCheckpointSchema = new Schema<IMigrationCheckpoint>(
  {
    phaseKey: { type: String, required: true, unique: true },
    lastBusDat: { type: Date, default: null },
    lastDocId: { type: String, default: null },
    processedRows: { type: Number, default: 0 },
    totalEstimatedRows: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['idle', 'running', 'paused', 'completed', 'failed'],
      default: 'idle',
    },
    errorMessage: { type: String, default: null },
  },
  { timestamps: true, collection: 'migration_checkpoints' }
);

export const MigrationCheckpoint = mongoose.model<IMigrationCheckpoint>(
  'MigrationCheckpoint',
  MigrationCheckpointSchema
);
export default MigrationCheckpoint;
