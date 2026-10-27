// src/models/PO.model.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IPOItem {
  variantId: mongoose.Types.ObjectId;
  sku: string;
  qty: number;
  price: number;
}

export interface IPO extends Document {
  orderId: mongoose.Types.ObjectId;
  vendorId: mongoose.Types.ObjectId;
  items: IPOItem[];
  total: number;
  generatedAt: Date;
  pdfUrl?: string;
  status: "pending" | "sent" | "acknowledged" | "completed";
  createdAt: Date;
  updatedAt: Date;
}

const POSchema = new Schema(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    items: [
      {
        variantId: {
          type: Schema.Types.ObjectId,
          ref: "Variant",
          required: true,
        },
        sku: { type: String, required: true, uppercase: true },
        qty: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true, min: 0 },
      },
    ],
    total: { type: Number, required: true, min: 0 },
    generatedAt: { type: Date, required: true, default: Date.now },
    pdfUrl: String,
    status: {
      type: String,
      enum: ["pending", "sent", "acknowledged", "completed"],
      default: "pending",
    },
  },
  { timestamps: true }
);

POSchema.index({ orderId: 1, vendorId: 1 });

export default mongoose.model<IPO>("PO", POSchema);
