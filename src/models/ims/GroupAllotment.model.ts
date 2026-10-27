import { Schema, model, Document, Types } from "mongoose";

/**
 * GroupAllotment Model
 * 
 * Purpose: Stores the allotment policies for an employee group.
 * This acts as the template for individual user credits.
 * When a user joins a group, they inherit these allotments.
 */

export interface IGroupAllotment extends Document {
  pageId: Types.ObjectId;
  groupId: Types.ObjectId;
  type: "product" | "category" | "subcategory";
  productId?: Types.ObjectId;
  categoryId?: Types.ObjectId;
  subcategoryName?: string;
  allotmentValue: number;
  isUnlimited?: boolean;
  priority: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const GroupAllotmentSchema = new Schema<IGroupAllotment>(
  {
    pageId: {
      type: Schema.Types.ObjectId,
      ref: "Page",
      required: true,
      index: true,
    },
    groupId: {
      type: Schema.Types.ObjectId,
      ref: "EmployeeGroup",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ["product", "category", "subcategory"],
      required: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Taxonomy",
    },
    subcategoryName: {
      type: String,
      trim: true,
    },
    allotmentValue: {
      type: Number,
      required: true,
      min: 0,
    },
    isUnlimited: {
      type: Boolean,
      default: false,
    },
    priority: {
      type: Number,
      required: true,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for quick lookup
GroupAllotmentSchema.index({ groupId: 1, type: 1, categoryId: 1, subcategoryName: 1 });
GroupAllotmentSchema.index({ groupId: 1, type: 1, productId: 1 });

export const GroupAllotment = model<IGroupAllotment>("GroupAllotment", GroupAllotmentSchema);
export default GroupAllotment;
