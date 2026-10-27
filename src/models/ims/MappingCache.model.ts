// src/models/MappingCache.model.ts

import mongoose, { Schema, Document } from 'mongoose';

export interface IMappingCache extends Document {
  vendorId: string;
  fieldMappings: Map<string, {
    unified: string;
    confidence: number;
    method: 'exact' | 'keyword' | 'fuzzy' | 'embedding' | 'llm';
    lastUsed: Date;
  }>;
  createdAt: Date;
  updatedAt: Date;
}

const MappingCacheSchema = new Schema({
  vendorId: { type: String, required: true, unique: true, index: true },
  fieldMappings: {
    type: Map,
    of: {
      unified: String,
      confidence: Number,
      method: String,
      lastUsed: Date,
    },
  },
}, { timestamps: true });

export default mongoose.model<IMappingCache>('MappingCache', MappingCacheSchema);