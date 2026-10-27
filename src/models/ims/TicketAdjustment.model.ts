import mongoose, { Schema, Document } from "mongoose";

export interface ITicketAdjustment extends Document {
  posOrderId: mongoose.Types.ObjectId;
  invoiceId?: mongoose.Types.ObjectId;
  adjustmentType: "additional_charge" | "void_reissue" | "credit_refund";
  amount: number;
  reason: string;
  batchStatus: "pre_batch" | "post_batch";
  processorTxnId?: string;
  processedBy: string;
  processedAt: Date;
  status: "pending" | "completed" | "failed";
  failureReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TicketAdjustmentSchema = new Schema<ITicketAdjustment>(
  {
    posOrderId: { type: Schema.Types.ObjectId, ref: "PosOrder", required: true, index: true },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice", index: true },
    adjustmentType: {
      type: String,
      enum: ["additional_charge", "void_reissue", "credit_refund"],
      required: true,
    },
    amount: { type: Number, required: true, min: 0 },
    reason: { type: String, required: true },
    batchStatus: { type: String, enum: ["pre_batch", "post_batch"], required: true },
    processorTxnId: { type: String },
    processedBy: { type: String, required: true },
    processedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ["pending", "completed", "failed"], default: "completed" },
    failureReason: { type: String },
  },
  { timestamps: true }
);

export default mongoose.model<ITicketAdjustment>("TicketAdjustment", TicketAdjustmentSchema);
