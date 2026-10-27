import mongoose, { Schema, Document } from 'mongoose';

export interface IInvoiceCounter extends Document {
  year: number;
  lastSeq: number;
}

const InvoiceCounterSchema = new Schema<IInvoiceCounter>({
  year: { type: Number, required: true, unique: true },
  lastSeq: { type: Number, required: true, default: 0 },
});

export const InvoiceCounter = mongoose.model<IInvoiceCounter>('InvoiceCounter', InvoiceCounterSchema);
