// src/models/VendorMapping.model.ts

import mongoose, { Schema, Document } from "mongoose";
import { UnifiedProduct, FieldMapping } from "../types";

export interface IVendorMapping extends Document {
  vendorId: string;
  unified: UnifiedProduct;
  vendor_data: Record<string, any>;
  mappings: FieldMapping[];
  unmapped: string[];
  createdAt: Date;
  updatedAt: Date;
}

const VendorMappingSchema = new Schema(
  {
    vendorId: { type: String, required: true, index: true },
    unified: {
      item_number: String,
      item_description: String,
      category: String,
      brand: String,
      retail_price: Number,
      quantity_on_hand: Number,
      color: String,
      size: String,
    },
    vendor_data: { type: Map, of: Schema.Types.Mixed },
    mappings: [
      {
        vendorField: String,
        unified: String,
        confidence: Number,
        method: String,
      },
    ],
    unmapped: [String],
  },
  { timestamps: true }
);

VendorMappingSchema.index({ "unified.item_number": 1 });
VendorMappingSchema.index({ "unified.category": 1 });
VendorMappingSchema.index({ "unified.brand": 1 });

// Add DB-level unique index to prevent duplicate vendor SKU entries
VendorMappingSchema.index(
  { vendorId: 1, "vendor_data.vendor_sku": 1 },
  { unique: true, sparse: true }
);

export default mongoose.model<IVendorMapping>(
  "VendorMapping",
  VendorMappingSchema
);
