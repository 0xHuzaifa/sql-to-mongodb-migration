// src/models/Inventory.model.ts

import mongoose, { Schema, Document } from "mongoose";

export interface IInventory extends Document {
  productId: mongoose.Types.ObjectId;
  variantId?: mongoose.Types.ObjectId;
  vendorId: string;
  vendorSku: string; // ✅ Changed from vendor_sku
  masterSku: string;
  origin: "vendor" | "inhouse";
  syncType: "api" | "csv" | "ftp" | "inhouse";
  location?: {
    warehouseId?: string; // Logical reference to Location.warehouseId
    binCode?: string;
    boxId?: string;
  };
  qtyOnHand: number;
  qtyAvailable: number;
  qtyReserved: number;
  moq: number;
  packingRules?: Record<string, any>;
  costPrice?: number;
  lastSyncDate?: Date;
  createdBy?: string;
  vendorRawData?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  upc?: string;
  map?: number;
  customerSpecificPrice?: number;
  extra_1?: string;
  extra_2?: string;
  extra_3?: string;
}

const InventorySchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    variantId: {
      type: Schema.Types.ObjectId,
      ref: "Variant",
      sparse: true,
      index: true,
    },
    vendorId: {
      type: String,
      required: true,
      ref: "Vendor",
    },
    vendorSku: {
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
    origin: {
      type: String,
      enum: ["vendor", "inhouse"],
      default: "vendor",
      index: true,
    },
    syncType: {
      type: String,
      enum: ["api", "csv", "ftp", "inhouse"],
      default: "api",
    },
    location: {
      warehouseId: { type: String, index: true },
      binCode: String,
      boxId: String,
    },
    qtyOnHand: { type: Number, default: 0 },
    qtyAvailable: { type: Number, default: 0 },
    qtyReserved: { type: Number, default: 0 },
    moq: {
      type: Number,
      default: 1,
      set: function (value: any) {
        // Handle NaN, null, undefined, or invalid values
        if (value === null || value === undefined || value === '' || isNaN(Number(value))) {
          return 1; // Default to 1
        }
        const numValue = Number(value);
        return numValue > 0 ? numValue : 1; // Ensure positive number
      }
    },
    packingRules: { type: Schema.Types.Mixed, default: {} },
    costPrice: { type: Number, default: 0, min: 0 },
    lastSyncDate: { type: Date },
    createdBy: { type: String, default: null },
    vendorRawData: { type: Schema.Types.Mixed, default: {} },
    upc: { type: String, sparse: true, index: true },
    map: { type: Number, default: 0, min: 0 },
    customerSpecificPrice: { type: Number, default: 0, min: 0 },
    extra_1: { type: String, default: null },
    extra_2: { type: String, default: null },
    extra_3: { type: String, default: null },
  },
  { timestamps: true }
);

// Indexes
InventorySchema.index({ vendorId: 1, vendorSku: 1 }, { unique: true });
InventorySchema.index({ masterSku: 1 }, { unique: true, sparse: true });

// Pre-validation logic
InventorySchema.pre<IInventory>("validate", function (next) {
  // Auto-calculate available quantity
  this.qtyAvailable = Math.max(0, this.qtyOnHand - (this.qtyReserved || 0));
  next();
});

// Pre-save logic
InventorySchema.pre<IInventory>("save", function (next) {
  // Auto-generate masterSku
  if (!this.masterSku && this.vendorId && this.vendorSku) {
    this.masterSku = `${this.vendorId}:${this.vendorSku}`.toUpperCase();
  }



  // Clean up NaN values for numeric fields
  if (isNaN(this.qtyOnHand)) {
    this.qtyOnHand = 0;
  }
  if (isNaN(this.moq)) {
    this.moq = 1; // Default MOQ to 1
  }

  // Type enforcement
  if (this.vendorSku && typeof this.vendorSku !== "string") {
    return next(new Error("vendorSku must be string"));
  }

  if (this.qtyOnHand !== undefined && typeof this.qtyOnHand !== "number") {
    return next(new Error("qtyOnHand must be number"));
  }

  if (this.moq !== undefined && typeof this.moq !== "number") {
    return next(new Error("moq must be number"));
  }

  if (this.costPrice !== undefined && typeof this.costPrice !== "number") {
    return next(new Error("costPrice must be number"));
  }

  next();
});

export default mongoose.model<IInventory>(
  "Inventory",
  InventorySchema,
  "inventory"
);
