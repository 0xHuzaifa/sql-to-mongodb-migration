import { Schema, model, Document, Types } from "mongoose";

/**
 * CategoryLimit Model
 *
 * Purpose: Manages category-specific limits that may override global allotment.
 * Used primarily with unit-based allotments to set per-category restrictions.
 *
 * Note: This model is separate from Allotment.categoryLimits to allow for
 * more complex category limit configurations and future extensibility.
 *
 * Relationships:
 * - pageId: Page this limit belongs to
 * - allotmentId: Allotment configuration (for unit-based allotments)
 * - categoryId: Category/taxonomy this limit applies to
 */
export interface ICategoryLimit extends Document {
  // Page Relationship
  pageId: Types.ObjectId; // Page this limit belongs to (ref: Page)
  allotmentId?: Types.ObjectId; // Optional: Specific allotment this limit applies to

  // Category
  categoryId: Types.ObjectId; // Category/taxonomy this limit applies to
  subcategoryName?: string; // Optional: Subcategory name within the category (e.g., "full sleeves", "half sleeves")

  // Limit Configuration
  limitType: "max_units" | "max_amount" | "max_percentage";
  limitValue: number; // The limit value

  // Period (if different from allotment period)
  periodType?: "yearly" | "quarterly" | "monthly" | "custom";
  customPeriodDays?: number;

  // Priority (for conflict resolution)
  priority: number; // Higher priority = more important

  // Status
  isActive: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const CategoryLimitSchema = new Schema<ICategoryLimit>(
  {
    pageId: {
      type: Schema.Types.ObjectId,
      ref: "Page",
      required: true,
      index: true,
    },
    allotmentId: {
      type: Schema.Types.ObjectId,
      ref: "Allotment",
      sparse: true,
      index: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Taxonomy", // Assuming Taxonomy model for categories
      required: true,
      index: true,
    },
    subcategoryName: {
      type: String,
      trim: true,
      lowercase: true,
      index: true,
    },
    limitType: {
      type: String,
      enum: ["max_units", "max_amount", "max_percentage"],
      required: true,
    },
    limitValue: {
      type: Number,
      required: true,
      min: 0,
    },
    periodType: {
      type: String,
      enum: ["yearly", "quarterly", "monthly", "custom"],
    },
    customPeriodDays: {
      type: Number,
      min: 1,
    },
    priority: {
      type: Number,
      required: true,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
CategoryLimitSchema.index({ pageId: 1, categoryId: 1 });
CategoryLimitSchema.index({ allotmentId: 1 });
CategoryLimitSchema.index({ categoryId: 1 });
CategoryLimitSchema.index({ pageId: 1, isActive: 1 });
CategoryLimitSchema.index({ priority: -1 }); // Descending for priority sorting

// Compound index: Ensure unique limit per portal-category-subcategory combination
CategoryLimitSchema.index(
  { pageId: 1, categoryId: 1, subcategoryName: 1, limitType: 1 },
  { unique: true, sparse: true }, // sparse allows null subcategoryName
);

// Validation: Ensure customPeriodDays exists for custom period type
CategoryLimitSchema.pre("save", function (next) {
  if (this.periodType === "custom" && !this.customPeriodDays) {
    return next(
      new Error("customPeriodDays is required for custom period type"),
    );
  }
  next();
});

export const CategoryLimit = model<ICategoryLimit>(
  "CategoryLimit",
  CategoryLimitSchema,
);
export default CategoryLimit;
