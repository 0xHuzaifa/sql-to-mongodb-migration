import { Schema, model, Document, Types } from "mongoose";

export interface IPackageProduct {
  productId: Types.ObjectId;
  variantId?: Types.ObjectId;
  quantity: number;
}

export interface IPackage extends Document {
  vendorId?: string;
  pageId?: string;
  name: string;
  description?: string;
  thumbnail?: string;
  category?: string;
  subcategory?: string;
  categoryPath?: { id: string; name: string }[];
  
  // Package-specific fields
  products: IPackageProduct[];
  price: number;
  units?: number;
  
  // Visibility & Restrictions
  visibleToRoles: ("admin" | "officer")[];
  visibleToGroups: Types.ObjectId[];
  
  // Purchase Restrictions
  purchaseLimit?: {
    perUser?: number;
    unlimited: boolean;
  };
  allowedUsers?: Types.ObjectId[];
  blockedUsers?: Types.ObjectId[];
  
  status: "active" | "inactive" | "archived";
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const PackageSchema = new Schema<IPackage>(
  {
    vendorId: { type: String, ref: "Vendor", required: false, index: true },
    pageId: { type: String, sparse: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000 },
    thumbnail: { type: String, trim: true },
    category: { type: String, ref: "Taxonomy" },
    subcategory: { type: String, trim: true },
    categoryPath: [{ id: String, name: String, _id: false }],
    
    products: [{
      productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
      variantId: { type: Schema.Types.ObjectId, ref: "Variant" },
      quantity: { type: Number, required: true, min: 1, default: 1 },
      _id: false
    }],
    
    price: { type: Number, required: true, min: 0 },
    units: { type: Number, min: 0 },
    
    visibleToRoles: [{ type: String, enum: ["admin", "officer"], default: [] }],
    visibleToGroups: [{ type: Schema.Types.ObjectId, ref: "EmployeeGroup" }],
    
    purchaseLimit: {
      perUser: { type: Number, min: 1 },
      unlimited: { type: Boolean, default: true }
    },
    allowedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    
    status: { type: String, enum: ["active", "inactive", "archived"], default: "active" },
    isActive: { type: Boolean, default: true, index: true }
  },
  { timestamps: true }
);

PackageSchema.index({ vendorId: 1, status: 1 });
PackageSchema.index({ name: 1 });
PackageSchema.index({ visibleToGroups: 1 });

export const Package = model<IPackage>("Package", PackageSchema);
