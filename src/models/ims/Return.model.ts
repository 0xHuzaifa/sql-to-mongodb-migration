// src/models/Return.model.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IReturn extends Document {
  orderId: mongoose.Types.ObjectId;
  itemId: mongoose.Types.ObjectId; // variantId
  qty: number;
  reason: string;
  status: "requested" | "approved" | "rejected" | "processed";
  restock: boolean;
  refundAmount?: number;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ReturnSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    itemId: {
      type: Schema.Types.ObjectId,
      ref: "Variant",
      required: true,
    },
    qty: { type: Number, required: true, min: 1 },
    reason: { type: String, required: true, minlength: 10, maxlength: 500 },
    status: {
      type: String,
      enum: ["requested", "approved", "rejected", "processed"],
      default: "requested",
      index: true,
    },
    restock: { type: Boolean, default: true },
    refundAmount: { type: Number, min: 0 },
    processedAt: Date,
  },
  { timestamps: true }
);

ReturnSchema.index({ orderId: 1, status: 1 });

export default mongoose.model<IReturn>("Return", ReturnSchema);
