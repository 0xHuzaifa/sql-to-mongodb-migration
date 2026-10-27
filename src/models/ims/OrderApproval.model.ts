import { Schema, model, Document, Types } from "mongoose";

/**
 * OrderApproval Model
 *
 * Purpose: Tracks approval workflow for employee orders. Stores approval history
 * and status for auditability.
 *
 * Relationships:
 * - orderId: Order requiring approval
 * - pageId: Page this approval belongs to
 * - requestedBy: Employee who requested the order
 * - approvers: Admins who approved/rejected
 */
export enum ApprovalStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  AUTO_APPROVED = "auto_approved",
  CANCELLED = "cancelled",
}

export interface IApprovalHistory {
  approverId: Types.ObjectId; // Admin who approved/rejected
  status: ApprovalStatus;
  comment?: string;
  approvedAt: Date;
}

export interface IOrderApproval extends Document {
  // Order Relationship
  orderId: Types.ObjectId; // Order requiring approval (ref: Order)
  pageId: Types.ObjectId; // Page this approval belongs to (ref: Page)

  // Request Information
  requestedBy: Types.ObjectId; // Employee who requested the order
  requestedAt: Date;
  orderAmount: number; // Total order amount

  // Approval Configuration
  requiredApprovers: number; // Number of approvers required
  currentApprovers: number; // Current number of approvers

  // Approval Status
  status: ApprovalStatus;

  // Excess Handling
  excessHandling?: "admin_approval";
  exceededAmount?: number;

  // Approval History (audit trail)
  approvalHistory: IApprovalHistory[];

  // Auto-approval Information
  autoApproved?: boolean;
  autoApprovalReason?: string; // Reason for auto-approval (e.g., "Below threshold")

  // Rejection Information
  rejectionReason?: string;
  rejectedBy?: Types.ObjectId;
  rejectedAt?: Date;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  approvedAt?: Date; // Final approval timestamp

  // Instance methods
  addApproval(approverId: Types.ObjectId, comment?: string): Promise<this>;
  rejectApproval(approverId: Types.ObjectId, reason: string): Promise<this>;
  autoApprove(reason: string): Promise<this>;
}

const ApprovalHistorySchema = new Schema<IApprovalHistory>(
  {
    approverId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(ApprovalStatus),
      required: true,
    },
    comment: {
      type: String,
      maxlength: 500,
    },
    approvedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { _id: false },
);

const OrderApprovalSchema = new Schema<IOrderApproval>(
  {
    orderId: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      unique: true, // One approval record per order
      index: true,
    },
    pageId: {
      type: Schema.Types.ObjectId,
      ref: "Page",
      required: true,
      index: true,
    },
    requestedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    requestedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },
    orderAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    requiredApprovers: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    currentApprovers: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    status: {
      type: String,
      enum: Object.values(ApprovalStatus),
      required: true,
      default: ApprovalStatus.PENDING,
      index: true,
    },
    approvalHistory: [ApprovalHistorySchema],
    autoApproved: {
      type: Boolean,
      default: false,
    },
    excessHandling: {
      type: String,
      enum: ["admin_approval"],
    },
    exceededAmount: {
      type: Number,
      min: 0,
    },
    autoApprovalReason: {
      type: String,
      maxlength: 200,
    },
    rejectionReason: {
      type: String,
      maxlength: 500,
    },
    rejectedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },
    rejectedAt: {
      type: Date,
    },
    approvedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes
OrderApprovalSchema.index({ orderId: 1 }, { unique: true });
OrderApprovalSchema.index({ pageId: 1, status: 1 });
OrderApprovalSchema.index({ requestedBy: 1 });
OrderApprovalSchema.index({ status: 1, requestedAt: -1 });
OrderApprovalSchema.index({ pageId: 1, requestedAt: -1 });

// Method: Add approval
OrderApprovalSchema.methods.addApproval = async function (
  approverId: Types.ObjectId,
  comment?: string,
) {
  if (this.status !== ApprovalStatus.PENDING) {
    throw new Error("Approval is not in pending status");
  }

  this.currentApprovers += 1;
  this.approvalHistory.push({
    approverId,
    status: ApprovalStatus.APPROVED,
    comment,
    approvedAt: new Date(),
  });

  // Check if required approvers reached
  if (this.currentApprovers >= this.requiredApprovers) {
    this.status = ApprovalStatus.APPROVED;
    this.approvedAt = new Date();
  }

  return this.save();
};

// Method: Reject approval
OrderApprovalSchema.methods.rejectApproval = async function (
  approverId: Types.ObjectId,
  reason: string,
) {
  if (this.status !== ApprovalStatus.PENDING) {
    throw new Error("Approval is not in pending status");
  }

  this.status = ApprovalStatus.REJECTED;
  this.rejectedBy = approverId;
  this.rejectedAt = new Date();
  this.rejectionReason = reason;

  this.approvalHistory.push({
    approverId,
    status: ApprovalStatus.REJECTED,
    comment: reason,
    approvedAt: new Date(),
  });

  return this.save();
};

// Method: Auto-approve
OrderApprovalSchema.methods.autoApprove = async function (reason: string) {
  if (this.status !== ApprovalStatus.PENDING) {
    throw new Error("Approval is not in pending status");
  }

  this.status = ApprovalStatus.AUTO_APPROVED;
  this.autoApproved = true;
  this.autoApprovalReason = reason;
  this.approvedAt = new Date();

  return this.save();
};

export const OrderApproval = model<IOrderApproval>(
  "OrderApproval",
  OrderApprovalSchema,
);
export default OrderApproval;
