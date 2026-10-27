import { Schema, Types, model, Document } from "mongoose";

// Enums
export enum OverrideType {
  USE_EXTRA_UNITS = "USE_EXTRA_UNITS", // Borrow from future allotment
  PAY_YOURSELF = "PAY_YOURSELF", // Out-of-pocket payment
}

export enum OverrideRequestStatus {
  PENDING_VENDOR_APPROVAL = "PENDING_VENDOR_APPROVAL",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  CANCELLED = "CANCELLED",
  EXPIRED = "EXPIRED",
}

// Interfaces
export interface IOverrideRequestItem {
  variantId: Types.ObjectId;
  productId: Types.ObjectId;
  productName: string;
  variantName: string;
  sku: string;
  requestedQty: number;
  unitPrice: number;
  totalPrice: number;
  /** Selected size for this line (e.g. "L", "32") — used when creating order */
  size?: string;
  /** Selected color for this line (e.g. "black", "navy blue") — used when creating order */
  color?: string;
  length?: string;
  notes?: string;
  exceededLimit: {
    type: "category" | "subcategory" | "product" | "total";
    limitId?: string;
    limitName?: string;
    available: number;
    excess: number;
  };
}

export interface IOverrideRequest extends Document {
  // References
  pageId: Types.ObjectId;
  userId: Types.ObjectId;
  orderId?: Types.ObjectId; // Set after order is created (if approved)

  // Request Details
  overrideType: OverrideType;
  reasonCode: string;
  reasonDetails?: string; // Additional explanation

  // Items & Amount
  items: IOverrideRequestItem[];
  totalRequestedAmount: number;
  totalExcessAmount: number; // Amount exceeding allotment

  // Status
  status: OverrideRequestStatus;

  // Vendor Decision
  vendorDecision?: {
    decidedBy: Types.ObjectId;
    decidedByName: string;
    decision: "APPROVED" | "REJECTED";
    comment?: string;
    decidedAt: Date;
  };

  // Timestamps
  requestedAt: Date;
  expiresAt?: Date; // Request expires if not acted upon
  completedAt?: Date;

  // Audit
  createdBy: Types.ObjectId;

  // Timestamps (auto)
  createdAt: Date;
  updatedAt: Date;

  // Methods
  approve(
    approverId: Types.ObjectId,
    approverName: string,
    comment?: string
  ): Promise<IOverrideRequest>;
  reject(
    approverId: Types.ObjectId,
    approverName: string,
    comment?: string
  ): Promise<IOverrideRequest>;
}

const OverrideRequestItemSchema = new Schema(
  {
    variantId: { type: Schema.Types.ObjectId, ref: "Variant", required: true },
    productId: { type: Schema.Types.ObjectId, ref: "Product", required: true },
    productName: { type: String, required: true },
    variantName: { type: String, required: true },
    sku: { type: String, required: true },
    requestedQty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 },
    size: { type: String, trim: true },
    color: { type: String, trim: true },
    length: { type: String, trim: true },
    notes: { type: String, trim: true },
    exceededLimit: {
      type: {
        type: String,
        enum: ["category", "subcategory", "product", "total"],
        required: true,
      },
      limitId: { type: String },
      limitName: { type: String },
      available: { type: Number, required: true },
      excess: { type: Number, required: true },
    },
  },
  { _id: false }
);

const OverrideRequestSchema = new Schema<IOverrideRequest>(
  {
    // References
    pageId: {
      type: Schema.Types.ObjectId,
      ref: "Page",
      required: true,
      index: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },

    // Request Details
    overrideType: {
      type: String,
      enum: Object.values(OverrideType),
      required: true,
    },
    reasonCode: { type: String, required: true },
    reasonDetails: { type: String, maxlength: 1000 },

    // Items & Amount
    items: {
      type: [OverrideRequestItemSchema],
      required: true,
      validate: [
        (arr: IOverrideRequestItem[]) => arr.length > 0,
        "At least one item required",
      ],
    },
    totalRequestedAmount: { type: Number, required: true, min: 0 },
    totalExcessAmount: { type: Number, required: true, min: 0 },

    // Status
    status: {
      type: String,
      enum: Object.values(OverrideRequestStatus),
      default: OverrideRequestStatus.PENDING_VENDOR_APPROVAL,
      index: true,
    },

    // Vendor Decision
    vendorDecision: {
      decidedBy: { type: Schema.Types.ObjectId, ref: "VendorUser" },
      decidedByName: { type: String },
      decision: { type: String, enum: ["APPROVED", "REJECTED"] },
      comment: { type: String },
      decidedAt: { type: Date },
    },

    // Timestamps
    requestedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    completedAt: { type: Date },

    // Audit
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  {
    timestamps: true,
  }
);

// Indexes
OverrideRequestSchema.index({ pageId: 1, status: 1 });
OverrideRequestSchema.index({ pageId: 1, userId: 1, createdAt: -1 });
OverrideRequestSchema.index({ status: 1, expiresAt: 1 });

// Methods
OverrideRequestSchema.methods.approve = async function (
  approverId: Types.ObjectId,
  approverName: string,
  comment?: string
) {
  this.vendorDecision = {
    decidedBy: approverId,
    decidedByName: approverName,
    decision: "APPROVED",
    comment,
    decidedAt: new Date(),
  };
  this.status = OverrideRequestStatus.APPROVED;
  this.completedAt = new Date();
  return this.save();
};

OverrideRequestSchema.methods.reject = async function (
  approverId: Types.ObjectId,
  approverName: string,
  comment?: string
) {
  this.vendorDecision = {
    decidedBy: approverId,
    decidedByName: approverName,
    decision: "REJECTED",
    comment,
    decidedAt: new Date(),
  };
  this.status = OverrideRequestStatus.REJECTED;
  this.completedAt = new Date();
  return this.save();
};

export const OverrideRequest = model<IOverrideRequest>(
  "OverrideRequest",
  OverrideRequestSchema
);
export default OverrideRequest;
