// src/models/InhouseImport.model.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IInhouseImport extends Document {
  jobId: string;
  records: any[];
  createdBy?: string;
  status: "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED";
  result?: any;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const InhouseImportSchema = new Schema(
  {
    jobId: { type: String, required: true, index: true, unique: true },
    records: { type: [Schema.Types.Mixed], required: true },
    createdBy: { type: String, default: null },
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "SUCCESS", "FAILED"],
      default: "PENDING",
    },
    result: Schema.Types.Mixed,
    error: { type: String, default: null },
  },
  { timestamps: true }
);

export default mongoose.model<IInhouseImport>(
  "InhouseImport",
  InhouseImportSchema
);
