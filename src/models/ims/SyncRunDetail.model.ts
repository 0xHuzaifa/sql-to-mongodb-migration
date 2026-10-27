// src/models/SyncRunDetail.model.ts
// Per-row/variant sync result for trackable sync reports (Vendor → Products → Variants).

import mongoose, { Schema, Document } from "mongoose";

export type SyncRowStatus = "success" | "failed";
export type FailureReason = "validation" | "mapping" | "create_error" | "unknown";

export interface ISyncRunDetail extends Document {
  syncId: string;
  vendorId: string;
  rowIndex: number;
  vendorSku: string;
  productName?: string;
  status: SyncRowStatus;
  productId?: mongoose.Types.ObjectId;
  variantId?: mongoose.Types.ObjectId;
  errorMessage?: string;
  failureReason?: FailureReason;
  rawSnapshot?: Record<string, unknown>;
  createdAt: Date;
}

const SyncRunDetailSchema = new Schema(
  {
    syncId: { type: String, required: true, index: true },
    vendorId: { type: String, required: true, index: true },
    rowIndex: { type: Number, required: true },
    vendorSku: { type: String, required: true },
    productName: String,
    status: { type: String, enum: ["success", "failed"], required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", default: null },
    variantId: { type: Schema.Types.ObjectId, ref: "Variant", default: null },
    errorMessage: String,
    failureReason: {
      type: String,
      enum: ["validation", "mapping", "create_error", "unknown"],
      default: null,
    },
    rawSnapshot: Schema.Types.Mixed,
  },
  { timestamps: true }
);

SyncRunDetailSchema.index({ vendorId: 1, syncId: 1 });
SyncRunDetailSchema.index({ vendorId: 1, productId: 1 });

export default mongoose.model<ISyncRunDetail>("SyncRunDetail", SyncRunDetailSchema);
