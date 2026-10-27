import { Schema, model, Document, Types } from "mongoose";

/**
 * BuyerEligibilityConfig Model
 *
 * Purpose: Enforces exactly one buyer mode per portal. The three modes are
 * mutually exclusive and must be enforced at the schema level.
 *
 * Buyer Modes:
 * 1. ONLY_ADMIN_CAN_BUY - Only admins can purchase
 * 2. EVERYONE_CAN_BUY - Everyone can purchase without approval
 * 3. EMPLOYEE_REQUIRES_ADMIN_APPROVAL - Employees can buy but need admin approval
 *
 * Relationships:
 * - pageId: Page this configuration belongs to (one-to-one)
 */
export enum BuyerMode {
  ONLY_ADMIN_CAN_BUY = "ONLY_ADMIN_CAN_BUY",
  EVERYONE_CAN_BUY = "EVERYONE_CAN_BUY",
  EMPLOYEE_REQUIRES_ADMIN_APPROVAL = "EMPLOYEE_REQUIRES_ADMIN_APPROVAL",
}

export interface IBuyerEligibilityConfig extends Document {
  // Page Relationship (one-to-one)
  pageId: Types.ObjectId; // Page this config belongs to (ref: Page)

  // Buyer Mode (exactly one, enforced)
  buyerMode: BuyerMode;

  // Configuration Details
  config: {
    // For EMPLOYEE_REQUIRES_ADMIN_APPROVAL mode
    approvalSettings?: {
      autoApprove: boolean; // Auto-approve orders below threshold
      approvalThreshold?: number; // Amount threshold for auto-approval
      notifyAdmins: boolean; // Notify admins of pending approvals
      requiredApprovers?: number; // Number of admins required to approve
    };

    // Group-based restrictions (optional)
    allowedGroups?: Types.ObjectId[]; // Employee groups allowed to purchase
    restrictedGroups?: Types.ObjectId[]; // Employee groups restricted from purchasing

    // Additional rules
    minOrderAmount?: number; // Minimum order amount
    maxOrderAmount?: number; // Maximum order amount per order
  };

  // Status
  isActive: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const BuyerEligibilityConfigSchema = new Schema<IBuyerEligibilityConfig>(
  {
    pageId: {
      type: Schema.Types.ObjectId,
      ref: "Page",
      required: true,
      unique: true, // Enforce one config per page
      index: true,
    },
    buyerMode: {
      type: String,
      enum: Object.values(BuyerMode),
      required: true,
      index: true,
    },
    config: {
      approvalSettings: {
        type: {
          autoApprove: {
            type: Boolean,
            default: false,
          },
          approvalThreshold: {
            type: Number,
            min: 0,
          },
          notifyAdmins: {
            type: Boolean,
            default: true,
          },
          requiredApprovers: {
            type: Number,
            min: 1,
            default: 1,
          },
        },
        required: false,
        _id: false,
      },
      allowedGroups: [
        {
          type: Schema.Types.ObjectId,
          ref: "EmployeeGroup",
        },
      ],
      restrictedGroups: [
        {
          type: Schema.Types.ObjectId,
          ref: "EmployeeGroup",
        },
      ],
      minOrderAmount: {
        type: Number,
        min: 0,
      },
      maxOrderAmount: {
        type: Number,
        min: 0,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    // Ensure only one config per portal
    // Enforced via unique index on pageId
  },
);

// Indexes
BuyerEligibilityConfigSchema.index({ pageId: 1 }, { unique: true });
BuyerEligibilityConfigSchema.index({ buyerMode: 1 });
BuyerEligibilityConfigSchema.index({ isActive: 1 });

// Validation: Ensure approval settings only exist for EMPLOYEE_REQUIRES_ADMIN_APPROVAL
BuyerEligibilityConfigSchema.pre("save", function (next) {
  if (this.buyerMode !== BuyerMode.EMPLOYEE_REQUIRES_ADMIN_APPROVAL) {
    // Clear approval settings if not applicable
    if (this.config.approvalSettings) {
      delete this.config.approvalSettings;
    }
  }
  next();
});

// Validation: Ensure allowedGroups and restrictedGroups don't overlap
BuyerEligibilityConfigSchema.pre("save", function (next) {
  if (
    this.config.allowedGroups &&
    this.config.restrictedGroups &&
    this.config.allowedGroups.length > 0 &&
    this.config.restrictedGroups.length > 0
  ) {
    const allowedSet = new Set(
      this.config.allowedGroups.map((id: Types.ObjectId) => id.toString()),
    );
    const restrictedSet = new Set(
      this.config.restrictedGroups.map((id: Types.ObjectId) => id.toString()),
    );

    // Check for overlap
    for (const id of allowedSet) {
      if (restrictedSet.has(id)) {
        return next(
          new Error(
            "Groups cannot be both allowed and restricted simultaneously",
          ),
        );
      }
    }
  }
  next();
});

export const BuyerEligibilityConfig = model<IBuyerEligibilityConfig>(
  "BuyerEligibilityConfig",
  BuyerEligibilityConfigSchema,
);
export default BuyerEligibilityConfig;
