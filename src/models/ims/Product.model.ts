// src/models/Product.model.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IProduct extends Document {
  vendorId?: string;
  /** Sync type: INHOUSE, API, CSV, FTP - tracks how product was created/synced */
  syncType?: "INHOUSE" | "API" | "CSV" | "FTP";
  /** Unique product-level SKU per vendor: {vendorId}:{productSlug}. Used for CSV/API upsert. */
  productMasterSku?: string;
  name: string;
  description?: string;
  category?: string; // Category name (references Taxonomy.category)
  subcategory?: string; // Subcategory name (references Taxonomy.subcategories[].name)
  /** Materialized path for N-level category taxonomy, storing ID and Name at each level */
  categoryPath?: { id: string; name: string }[];
  brand?: string;
  manufacturer?: string;
  /** Product thumbnail URL (required for inhouse products) */
  thumbnail?: string;
  status?: "active" | "archived";
  attributes?: mongoose.Types.ObjectId[];
  /** Per-product attribute values: key = attributeId string, value = array of values for this product */
  attributeValues?: Record<string, string[]>;
  createdAt: Date;
  updatedAt: Date;

  // New fields
  itemType?: "Inventory" | "Non-inventory" | "Service" | "Discount";
  discountable?: boolean;
  taxable?: boolean;
  substituteItems?: mongoose.Types.ObjectId[];
  additionalDescription1?: string;
  additionalDescription2?: string;
  additionalDescription3?: string;

  /** Tax category (name/code) used for VAT/GST rules */
  taxCategory?: string;
  /** Warranty periods (numeric, in months). Use 0 if not applicable. */
  warrentyPeriod1?: number;
  warrentyPeriod2?: number;
  mandatoryAlterations?: any[];
  /** Flag indicating if product requires official ID/Badge verification on POS scan */
  isRestrictedItem?: boolean;
  /** Custom prompt text displayed during ID verification popup */
  restrictedItemPrompt?: string;
  /** Warehouse-level barcode for products with NO variants (used for POS scanning) */
  barcode?: string;
  /** UPC for products with NO variants */
  upc?: string;
}

const ProductSchema = new Schema(
  {
    vendorId: { type: String, index: true, ref: "Vendor", required: true },
    syncType: {
      type: String,
      enum: ["INHOUSE", "API", "CSV", "FTP"],
      index: true,
    },
    productMasterSku: { type: String, trim: true },
    name: {
      type: String,
      required: true,
      minLength: 3,
      maxLength: 200,
      trim: true,
    },
    description: {
      type: String,
      default: "",
    },
    brand: { type: String, default: null, ref: "Brand" },
    manufacturer: { type: String, default: null, trim: true },
    thumbnail: { type: String, default: null, trim: true },
    category: { type: String, default: null, ref: "Taxonomy" },
    subcategory: { type: String, default: null, trim: true },
    categoryPath: [
      {
        id: { type: String },
        name: { type: String },
        _id: false,
      },
    ],
    status: {
      type: String,
      enum: ["active", "archived"],
      default: "active",
    },
    attributes: [{ type: Schema.Types.ObjectId, ref: "Attribute" }],
    attributeValues: { type: Schema.Types.Mixed, default: {} },

    // New fields
    itemType: {
      type: String,
      enum: ["Inventory", "Non-inventory", "Service", "Discount"],
      default: "Inventory",
    },
    discountable: { type: Boolean, default: false },
    taxable: { type: Boolean, default: false },
    substituteItems: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    additionalDescription1: { type: String, default: "" },
    additionalDescription2: { type: String, default: "" },
    additionalDescription3: { type: String, default: "" },

    // Tax & warranty fields
    taxCategory: { type: String, default: null, trim: true },
    // Warranty periods in months (0 = not specified)
    warrentyPeriod1: { type: Number, default: 0, min: 0 },
    warrentyPeriod2: { type: Number, default: 0, min: 0 },
    mandatoryAlterations: { type: Schema.Types.Mixed, default: [] },
    isRestrictedItem: { type: Boolean, default: false, index: true },
    restrictedItemPrompt: { type: String, default: null, trim: true },
    // Warehouse-level barcode for products with no variants (staff-assigned, POS scanning)
    barcode: { type: String, default: null, trim: true },
    // UPC for products with no variants
    upc: { type: String, default: null, trim: true },
  },
  { timestamps: true },
);

ProductSchema.index({ name: 1 }); // 1 = ascending order
ProductSchema.index({ status: 1 });
ProductSchema.index({ category: 1, subcategory: 1 }); // For filtering by category and subcategory

// Compound index: vendorId + name to avoid duplicate product names per vendor
ProductSchema.index({ vendorId: 1, name: 1 }, { unique: false });
// Product-level master SKU: one per product per vendor (for CSV/API upsert).
// Uses partialFilterExpression so the unique constraint only applies when
// productMasterSku is actually set — sparse:true does NOT work correctly on
// compound indexes when vendorId is always present (non-null).
ProductSchema.index(
  { vendorId: 1, productMasterSku: 1 },
  {
    unique: true,
    partialFilterExpression: {
      productMasterSku: { $type: "string" },
    },
  },
);

// Virtual: fullName
ProductSchema.virtual("fullName").get(function (this: IProduct) {
  return `${this.name} ${this.description || ""}`.trim();
});
ProductSchema.set("toJSON", { virtuals: true });

// Pre-save normalization
ProductSchema.pre<IProduct>("save", function (next) {
  if (this.name) this.name = this.name.trim();
  if (this.description) this.description = this.description.trim();
  if (this.taxCategory) this.taxCategory = this.taxCategory.trim();
  // if (this.category === '') this.category = null;
  next();
});

export default mongoose.model<IProduct>("Product", ProductSchema);
