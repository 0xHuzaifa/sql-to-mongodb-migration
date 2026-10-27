// src/models/Image.model.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IImage extends Document {
  productId?: mongoose.Types.ObjectId;
  variantId?: mongoose.Types.ObjectId;
  urls: string[];
  thumbnailUrl?: string;
  alt?: string;
  order?: number;
  dimensions?: { width: number; height: number };
  fileSize?: number;
  format?: "jpg" | "jpeg" | "png" | "webp" | "gif";
  metadata?: Record<string, any>;
  isPrimary?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ImageSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    variantId: { type: Schema.Types.ObjectId, ref: "Variant" },
    urls: [{ type: String, required: true }],
    thumbnailUrl: {
      type: String,
      default: null,
    },
    optimizedUrl: { type: String, default: null },
    alt: { type: String, default: "" },
    order: {
      type: Number,
      default: 0,
    },
    dimensions: {
      width: Number,
      height: Number,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    format: {
      type: String,
      enum: ["jpg", "jpeg", "png", "webp", "gif"],
      default: "jpg",
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
    isPrimary: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Product-level index to help image lookups
ImageSchema.index({ productId: 1, variantId: 1 });

ImageSchema.pre("save", function (next) {
  if (!this.productId && !this.variantId) {
    return next(new Error("Either productId or variantId is required"));
  }
  next();
});

export default mongoose.model<IImage>("Image", ImageSchema);
