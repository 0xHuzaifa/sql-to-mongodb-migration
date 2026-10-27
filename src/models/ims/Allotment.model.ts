import { Schema, model, Document, Types } from "mongoose";

/**
 * Allotment Model
 *
 * Purpose: Manages allotment system with mutually exclusive money-based or
 * unit-based models. Only one allotment model can exist per portal.
 *
 * Allotment Types:
 * A. Money-based: Total monetary allowance, period-based (yearly/custom)
 * B. Unit-based: Total unit allowance, period-based, products consume units,
 *    category limits may override global allotment
 *
 * Relationships:
 * - pageId: Page this allotment belongs to (one-to-one)
 * - categoryLimits: Category-specific limits (for unit-based)
 */
export enum AllotmentType {
  MONEY = "money",
  UNIT = "unit",
}

export enum PeriodType {
  YEARLY = "yearly",
  QUARTERLY = "quarterly",
  MONTHLY = "monthly",
  CUSTOM = "custom",
}

export interface IAllotment extends Document {
  // Page Relationship (one-to-one)
  pageId: Types.ObjectId; // Page this allotment belongs to (ref: Page)

  // Allotment Type (mutually exclusive)
  type: AllotmentType;

  // Period Configuration
  periodType: PeriodType;
  customPeriodDays?: number; // For CUSTOM period type

  // Money-based Configuration
  moneyConfig?: {
    totalAllowance: number; // Total monetary allowance per period
    currency: string; // Currency code (USD, EUR, etc.)
    carryForward: boolean; // Allow unused balance to carry forward
    maxCarryForward?: number; // Maximum amount that can carry forward
  };

  // Unit-based Configuration
  unitConfig?: {
    totalUnits: number; // Total unit allowance per period
    unitName: string; // Name of the unit (e.g., "credits", "points", "items")
    carryForward: boolean; // Allow unused units to carry forward
    maxCarryForward?: number; // Maximum units that can carry forward
  };

  // Category Limits (for unit-based allotment)
  categoryLimits?: Array<{
    categoryId: Types.ObjectId; // Reference to category/taxonomy
    subcategoryName?: string; // Optional: Subcategory name within the category
    maxUnits: number; // Maximum units allowed for this category/subcategory
    priority: number; // Priority order (higher = more important)
  }>;

  // Status
  isActive: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const AllotmentSchema = new Schema<IAllotment>(
  {
    pageId: {
      type: Schema.Types.ObjectId,
      ref: "Page",
      required: [true, "pageId is required"],
      unique: true, // Enforce one allotment per page
      index: true,
      sparse: false, // Don't allow null/undefined values
    },
    type: {
      type: String,
      enum: Object.values(AllotmentType),
      required: true,
      default: AllotmentType.UNIT, // Default to unit-based allotment
      index: true,
    },
    periodType: {
      type: String,
      enum: Object.values(PeriodType),
      required: true,
      default: PeriodType.YEARLY,
    },
    customPeriodDays: {
      type: Number,
      min: 1,
      validate: {
        validator: function (this: IAllotment, value: number) {
          // customPeriodDays required only for CUSTOM period type
          if (this.periodType === PeriodType.CUSTOM) {
            return value !== undefined && value > 0;
          }
          return true;
        },
        message: "customPeriodDays is required for CUSTOM period type",
      },
    },
    moneyConfig: {
      totalAllowance: {
        type: Number,
        min: 0,
      },
      currency: {
        type: String,
        uppercase: true,
        default: "USD",
      },
      carryForward: {
        type: Boolean,
        default: false,
      },
      maxCarryForward: {
        type: Number,
        min: 0,
      },
    },
    unitConfig: {
      totalUnits: {
        type: Number,
        min: 0,
      },
      unitName: {
        type: String,
        trim: true,
        default: "units",
      },
      carryForward: {
        type: Boolean,
        default: false,
      },
      maxCarryForward: {
        type: Number,
        min: 0,
      },
    },
    categoryLimits: [
      {
        categoryId: {
          type: Schema.Types.ObjectId,
          ref: "Taxonomy", // Assuming Taxonomy model for categories
        },
        subcategoryName: {
          type: String,
          trim: true,
          lowercase: true,
        },
        maxUnits: {
          type: Number,
          required: true,
          min: 0,
        },
        priority: {
          type: Number,
          required: true,
          default: 0,
        },
      },
    ],
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
AllotmentSchema.index({ pageId: 1 }, { unique: true, sparse: false });
AllotmentSchema.index({ type: 1 });
AllotmentSchema.index({ periodType: 1 });
AllotmentSchema.index({ isActive: 1 });

// Validation: Ensure pageId is always set
AllotmentSchema.pre("save", function (next) {
  if (!this.pageId) {
    return next(new Error("pageId is required and cannot be null"));
  }
  next();
});

// Validation: Ensure moneyConfig exists only for MONEY type
AllotmentSchema.pre("save", function (next) {
  if (this.type === AllotmentType.MONEY && !this.moneyConfig) {
    return next(new Error("moneyConfig is required for MONEY type allotment"));
  }
  if (this.type === AllotmentType.UNIT && !this.unitConfig) {
    return next(new Error("unitConfig is required for UNIT type allotment"));
  }

  // Clear configs that don't apply
  if (this.type === AllotmentType.MONEY) {
    this.unitConfig = undefined;
    this.categoryLimits = undefined;
  }
  if (this.type === AllotmentType.UNIT) {
    this.moneyConfig = undefined;
  }

  next();
});

// Validation: Ensure categoryLimits only exist for UNIT type
AllotmentSchema.pre("save", function (next) {
  if (this.type === AllotmentType.MONEY && this.categoryLimits?.length) {
    return next(
      new Error("categoryLimits can only be used with UNIT type allotment"),
    );
  }
  next();
});

export const Allotment = model<IAllotment>("Allotment", AllotmentSchema);
export default Allotment;
