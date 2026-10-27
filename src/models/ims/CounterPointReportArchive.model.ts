import mongoose, { Schema, Document } from "mongoose";

export interface ICounterPointReportArchive extends Document {
  reportId: string;
  reportName: string;
  reportType: string; // EOD_ZOUT, SALES_BY_DEPT, INVENTORY_VALUATION, etc.
  periodStart?: Date;
  periodEnd?: Date;
  totalSales: number;
  taxCollected: number;
  transactionCount: number;
  notes?: string;
  rawData?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const CounterPointReportArchiveSchema = new Schema<ICounterPointReportArchive>(
  {
    reportId: { type: String, required: true, index: true },
    reportName: { type: String, required: true },
    reportType: { type: String, default: "EOD_ZOUT", index: true },
    periodStart: { type: Date },
    periodEnd: { type: Date },
    totalSales: { type: Number, default: 0 },
    taxCollected: { type: Number, default: 0 },
    transactionCount: { type: Number, default: 0 },
    notes: { type: String, default: "" },
    rawData: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const CounterPointReportArchive = mongoose.model<ICounterPointReportArchive>(
  "CounterPointReportArchive",
  CounterPointReportArchiveSchema
);
export default CounterPointReportArchive;
