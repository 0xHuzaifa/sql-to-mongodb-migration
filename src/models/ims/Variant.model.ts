// src/models/Variant.model.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IVariant extends Document {
  productId: mongoose.Types.ObjectId;
  vendorId: string;
  sku: string;
  masterSku: string;
  size?: string;
  color?: string[];
  length?: string;
  lengthName?: string;
  colorNum?: string;
  price: number;
  originalPrice?: number;
  shippingCost?: number;
  extraCosts?: { name: string; value: number }[];
  // lastPrice holds the price before shipping/extra costs were applied
  lastPrice?: number;
  regularPrice?: number;
  costPrice?: number;
  lastCost?: number;
  alternatePrice1?: number;
  alternatePrice2?: number;
  alternatePrice3?: number;
  images?: string[];
  upc?: string;
  barcode?: string;
  map?: number;
  additionalAttributes?: Record<string, any>;
  sortOrder?: number;
  createdAt: Date;
  updatedAt: Date;
}

const VariantSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      // ref: "Inventory",
      required: true,
      index: true,
    },
    vendorId: {
      type: String,
      ref: "Vendor",
      required: true,
      index: true,
    },
    sku: {
      type: String,
      required: true,
      uppercase: true,
      index: true,
    },
    masterSku: {
      type: String,
      required: true,
      uppercase: true,
    },
    size: {
      type: String,
      default: null,
      required: false,
    },
    color: [{ type: String, lowercase: true, required: false }],
    length: {
      type: String,
      default: null,
      required: false,
    },
    lengthName: {
      type: String,
      default: null,
      required: false,
    },
    colorNum: {
      type: String,
      default: null,
      required: false,
    },
    price: { type: Number, required: true, min: 0, default: 0 },
    originalPrice: { type: Number, default: 0, min: 0 },
    shippingCost: { type: Number, default: 0, min: 0 },
    extraCosts: {
      type: [
        {
          name: { type: String, default: "" },
          value: { type: Number, default: 0, min: 0 },
        },
      ],
      default: [],
    },
    lastPrice: { type: Number, default: 0, min: 0 },
    regularPrice: { type: Number, default: null, min: 0 },
    costPrice: { type: Number, default: 0, min: 0 },
    lastCost: { type: Number, default: null, min: 0 },
    alternatePrice1: { type: Number, default: null, min: 0 },
    alternatePrice2: { type: Number, default: null, min: 0 },
    alternatePrice3: { type: Number, default: null, min: 0 },
    images: [{ type: String }],
    upc: { type: String, default: null, trim: true },
    // Warehouse-level barcode (set by staff, used for POS scanning). Distinct from UPC (world-level, vendor-supplied).
    barcode: { type: String, default: null, trim: true },
    map: { type: Number, default: null, min: 0 },
    additionalAttributes: { type: Schema.Types.Mixed, default: {} },
    sortOrder: { type: Number, default: null },
  },
  { timestamps: true },
);

// Compound unique: productId + vendorId + sku
VariantSchema.index({ vendorId: 1, sku: 1 }, { unique: true });
VariantSchema.index({ masterSku: 1 }, { unique: true });
VariantSchema.index({ price: 1 });
// Color filter ke liye
VariantSchema.index({ color: 1 });

VariantSchema.pre<IVariant>("save", function (next) {
  if (this.sku) this.sku = this.sku.trim().toUpperCase();

  // Auto-generate masterSku: VENDOR_SKU format
  if (!this.masterSku && this.vendorId && this.sku) {
    this.masterSku = `${this.vendorId}:${this.sku}`.toUpperCase();
  }

  if (Array.isArray(this.color))
    this.color = this.color.map((c: any) => String(c).trim());

  if (!this.originalPrice || this.originalPrice === 0) {
    this.originalPrice = this.price;
  }

  next();
});

export default mongoose.model<IVariant>("Variant", VariantSchema);
