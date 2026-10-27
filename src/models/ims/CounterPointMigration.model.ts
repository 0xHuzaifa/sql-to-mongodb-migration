import mongoose, { Schema, Document } from "mongoose";

export interface IMigrationRecordLog {
  identifier: string;
  status: "success" | "warning" | "error" | "skipped";
  message: string;
  rawData?: Record<string, any>;
  importedAt: Date;
}

export interface ICounterPointMigration extends Document {
  batchId: string;
  module:
    | "barcodes"
    | "customers"
    | "company_customers"
    | "sales_history"
    | "invoices"
    | "reports"
    | "other_data";
  fileName: string;
  totalRecords: number;
  successfulRecords: number;
  warningRecords: number;
  failedRecords: number;
  skippedRecords: number;
  records: IMigrationRecordLog[];
  executedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const MigrationRecordLogSchema = new Schema<IMigrationRecordLog>(
  {
    identifier: { type: String, required: true },
    status: {
      type: String,
      enum: ["success", "warning", "error", "skipped"],
      required: true,
    },
    message: { type: String, required: true },
    rawData: { type: Schema.Types.Mixed },
    importedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const CounterPointMigrationSchema = new Schema<ICounterPointMigration>(
  {
    batchId: { type: String, required: true, unique: true, index: true },
    module: {
      type: String,
      enum: [
        "barcodes",
        "customers",
        "company_customers",
        "sales_history",
        "invoices",
        "reports",
        "other_data",
      ],
      required: true,
      index: true,
    },
    fileName: { type: String, default: "counterpoint_export.csv" },
    totalRecords: { type: Number, default: 0 },
    successfulRecords: { type: Number, default: 0 },
    warningRecords: { type: Number, default: 0 },
    failedRecords: { type: Number, default: 0 },
    skippedRecords: { type: Number, default: 0 },
    records: [MigrationRecordLogSchema],
    executedBy: { type: String, default: "System Admin" },
  },
  { timestamps: true }
);

export const CounterPointMigration = mongoose.model<ICounterPointMigration>(
  "CounterPointMigration",
  CounterPointMigrationSchema
);
export default CounterPointMigration;
