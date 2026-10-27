import { Schema, model, Document, Types } from "mongoose";
import type { ICustomInputField } from "./Alteration.model";

/**
 * GroupProductAssignment Model
 *
 * Purpose: Tags products to employee groups at different levels:
 * - Product level: Individual products assigned to a group
 * - Category level: Entire category assigned to a group
 * - Subcategory level: Entire subcategory assigned to a group
 *
 * This allows employees to see only products relevant to their group.
 *
 * Relationships:
 * - pageId: Page this assignment belongs to
 * - employeeGroupId: Employee group this assignment is for
 * - productId: Individual product (if assignmentType is 'product')
 * - categoryId: Category (if assignmentType is 'category' or 'subcategory')
 * - subcategoryName: Subcategory name (if assignmentType is 'subcategory')
 */
export enum AssignmentType {
  PRODUCT = "product", // Individual product assignment
  CATEGORY = "category", // Entire category assignment
  SUBCATEGORY = "subcategory", // Entire subcategory assignment
}

/**
 * Mandatory Alteration Item Types
 * - "product": Reference to an existing product in the Product collection
 * - "alteration": Reference to a custom service alteration in the Alteration collection
 */
export type MandatoryAlterationType = "product" | "alteration";

export interface IMandatoryAlterationItem {
  type: MandatoryAlterationType;
  productId?: Types.ObjectId; // Reference to existing product (if type === 'product')
  alterationId?: Types.ObjectId; // Reference to custom service alteration (if type === 'alteration')
  customInputFields?: ICustomInputField[];
  isRequired: boolean; // Must be included in checkout
  minQuantity?: number; // Minimum quantity required
  maxQuantity?: number; // Maximum quantity allowed
}

export interface IGroupProductAssignment extends Document {
  // Page Relationship
  pageId: Types.ObjectId; // Page this assignment belongs to (ref: Page)

  // Employee Group
  employeeGroupId: Types.ObjectId; // Employee group this assignment is for (ref: EmployeeGroup)

  // Assignment Type
  assignmentType: AssignmentType; // Type of assignment (product, category, subcategory)

  // Product Assignment (for assignmentType === 'product')
  productId?: Types.ObjectId; // Individual product (ref: Product)

  // Category Assignment (for assignmentType === 'category' or 'subcategory')
  categoryId?: Types.ObjectId; // Category (ref: Taxonomy)
  subcategoryName?: string; // Subcategory name within the category (for assignmentType === 'subcategory')

  // Mandatory Alterations (only for assignmentType === 'product')
  // These are products or custom service alterations that must be added when purchasing the assigned product
  mandatoryAlterations?: IMandatoryAlterationItem[];

  // Color restriction
  allowedColors?: string[];

  // Status
  isActive: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const GroupProductAssignmentSchema = new Schema<IGroupProductAssignment>(
  {
    pageId: {
      type: Schema.Types.ObjectId,
      ref: "Page",
      required: true,
      index: true,
    },
    employeeGroupId: {
      type: Schema.Types.ObjectId,
      ref: "EmployeeGroup",
      required: true,
      index: true,
    },
    assignmentType: {
      type: String,
      enum: Object.values(AssignmentType),
      required: true,
      index: true,
    },
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      sparse: true,
      index: true,
    },
    categoryId: {
      type: Schema.Types.ObjectId,
      ref: "Taxonomy",
      sparse: true,
      index: true,
    },
    subcategoryName: {
      type: String,
      trim: true,
      lowercase: true,
      sparse: true,
    },
    mandatoryAlterations: [
      {
        type: {
          type: String,
          enum: ["product", "alteration"],
          required: true,
        },
        productId: {
          type: Schema.Types.ObjectId,
          ref: "Product",
          sparse: true,
        },
        alterationId: {
          type: Schema.Types.ObjectId,
          ref: "Alteration",
          sparse: true,
        },
        customInputFields: {
          type: [Schema.Types.Mixed],
          default: [],
        },
        isRequired: {
          type: Boolean,
          default: true,
        },
        minQuantity: {
          type: Number,
          min: 0,
          default: 1,
        },
        maxQuantity: {
          type: Number,
          min: 1,
        },
      },
    ],
    allowedColors: {
      type: [String],
      default: [],
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
GroupProductAssignmentSchema.index({ pageId: 1, employeeGroupId: 1 });
GroupProductAssignmentSchema.index({ employeeGroupId: 1, isActive: 1 });
GroupProductAssignmentSchema.index({ productId: 1 });
GroupProductAssignmentSchema.index({ categoryId: 1 });
GroupProductAssignmentSchema.index({ pageId: 1, isActive: 1 });

// Compound index: Ensure unique product assignment per group
GroupProductAssignmentSchema.index(
  { pageId: 1, employeeGroupId: 1, productId: 1, assignmentType: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { assignmentType: AssignmentType.PRODUCT },
  },
);

// Compound index: Ensure unique category assignment per group
GroupProductAssignmentSchema.index(
  { pageId: 1, employeeGroupId: 1, categoryId: 1, assignmentType: 1 },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { assignmentType: AssignmentType.CATEGORY },
  },
);

// Compound index: Ensure unique subcategory assignment per group
GroupProductAssignmentSchema.index(
  {
    pageId: 1,
    employeeGroupId: 1,
    categoryId: 1,
    subcategoryName: 1,
    assignmentType: 1,
  },
  {
    unique: true,
    sparse: true,
    partialFilterExpression: { assignmentType: AssignmentType.SUBCATEGORY },
  },
);

// Validation: Ensure required fields based on assignmentType
GroupProductAssignmentSchema.pre("save", function (next) {
  if (this.assignmentType === AssignmentType.PRODUCT) {
    if (!this.productId) {
      return next(
        new Error("productId is required for PRODUCT assignment type"),
      );
    }
    // Clear category fields for product assignment
    this.categoryId = undefined;
    this.subcategoryName = undefined;

    // Validate mandatory alterations for product assignments
    if (this.mandatoryAlterations && this.mandatoryAlterations.length > 0) {
      for (const alt of this.mandatoryAlterations) {
        if (alt.type === "product") {
          if (!alt.productId) {
            return next(
              new Error(
                "productId is required for product-type mandatory alteration",
              ),
            );
          }
          // Clear alterationId for product type
          alt.alterationId = undefined;
        } else if (alt.type === "alteration") {
          if (!alt.alterationId) {
            return next(
              new Error(
                "alterationId is required for alteration-type mandatory alteration",
              ),
            );
          }
          // Clear productId for alteration type
          alt.productId = undefined;
        }
      }
    }
  } else if (this.assignmentType === AssignmentType.CATEGORY) {
    if (!this.categoryId) {
      return next(
        new Error("categoryId is required for CATEGORY assignment type"),
      );
    }
    // Clear product and subcategory fields
    this.productId = undefined;
    this.subcategoryName = undefined;
    // Clear mandatory alterations for non-product assignments
    this.mandatoryAlterations = undefined;
  } else if (this.assignmentType === AssignmentType.SUBCATEGORY) {
    if (!this.categoryId || !this.subcategoryName) {
      return next(
        new Error(
          "categoryId and subcategoryName are required for SUBCATEGORY assignment type",
        ),
      );
    }
    // Clear product field
    this.productId = undefined;
    // Clear mandatory alterations for non-product assignments
    this.mandatoryAlterations = undefined;
  }
  next();
});

export const GroupProductAssignment = model<IGroupProductAssignment>(
  "GroupProductAssignment",
  GroupProductAssignmentSchema,
);
export default GroupProductAssignment;
