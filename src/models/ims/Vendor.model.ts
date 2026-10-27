// src/models/Vendor.model.ts

import mongoose, { Schema, Document } from "mongoose";
import { VendorConfig } from "../types";

export interface IVendor extends Document, VendorConfig {
  createdAt: Date;
  updatedAt: Date;
  fieldMappings?: Array<{
    vendorField: string;
    unifiedField: string;
    confidence: number;
    method: string;
    lastUpdated: Date;
  }>;
  mappingStats?: {
    totalFields: number;
    mappedFields: number;
    unmappedFields: string[];
    lastSyncDate: Date;
    mappingAccuracy: number;
  };
}

const VendorSchema = new Schema(
  {
    vendorId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    syncType: {
      type: String,
      enum: ["API", "FTP", "CSV", "INHOUSE"],
      required: true,
    },
    isActive: { type: Boolean, default: true },
    connection: {
      apiUrl: String,
      apiKey: String,
      ftpHost: String,
      ftpUser: String,
      ftpPassword: String,
      ftpPath: String,
      ftpPort: { type: Number, default: 21 },
      ftpSecure: { type: Boolean, default: false },
    },
    validationRules: {
      requiredFields: [String],
    },
    retryPolicy: {
      maxAttempts: { type: Number, default: 3 },
      retryIntervalMinutes: { type: Number, default: 15 },
    },
    fieldMappings: [
      {
        vendorField: String,
        unifiedField: String,
        confidence: Number,
        method: String,
        lastUpdated: { type: Date, default: Date.now },
      },
    ],
    mappingStats: {
      totalFields: Number,
      mappedFields: Number,
      unmappedFields: [String],
      lastSyncDate: Date,
      mappingAccuracy: Number,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IVendor>("Vendor", VendorSchema);
