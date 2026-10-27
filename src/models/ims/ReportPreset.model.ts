import mongoose, { Schema, Document } from 'mongoose';

export interface IReportPreset extends Document {
  name: string;
  description?: string;
  reportType?: string;
  customTitle?: string;
  dateRangeType?: string;
  startDate?: string;
  endDate?: string;
  viewMode?: string;
  summaryOnly?: boolean;
  filters?: Record<string, any>;
  domain?: string;
  audience?: any;
  modifiers?: any;
  layout?: string;
  userId?: mongoose.Types.ObjectId;
}

const ReportPresetSchema = new Schema<IReportPreset>(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    reportType: { type: String },
    customTitle: { type: String },
    dateRangeType: { type: String },
    startDate: { type: String },
    endDate: { type: String },
    viewMode: { type: String },
    summaryOnly: { type: Boolean, default: false },
    filters: { type: Schema.Types.Mixed, default: {} },
    domain: { type: String },
    audience: { type: Schema.Types.Mixed },
    modifiers: { type: Schema.Types.Mixed },
    layout: { type: String },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, strict: false }
);

export default mongoose.model<IReportPreset>('ReportPreset', ReportPresetSchema);
