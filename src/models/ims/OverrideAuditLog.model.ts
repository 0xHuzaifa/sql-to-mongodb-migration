import { Schema, Types, model, Document } from "mongoose";

export enum OverrideAuditAction {
  // Request lifecycle
  REQUEST_CREATED = "REQUEST_CREATED",
  REQUEST_APPROVED = "REQUEST_APPROVED",
  REQUEST_REJECTED = "REQUEST_REJECTED",
  REQUEST_CANCELLED = "REQUEST_CANCELLED",
  REQUEST_EXPIRED = "REQUEST_EXPIRED",

  // Order lifecycle (after approval)
  ORDER_CREATED_FROM_OVERRIDE = "ORDER_CREATED_FROM_OVERRIDE",
  ORDER_COMPLETED = "ORDER_COMPLETED",
  ORDER_CANCELLED = "ORDER_CANCELLED",

  // Admin actions
  OVERRIDE_SETTINGS_UPDATED = "OVERRIDE_SETTINGS_UPDATED",
  OVERRIDE_CAPABILITY_LOCKED = "OVERRIDE_CAPABILITY_LOCKED",
  OVERRIDE_CAPABILITY_UNLOCKED = "OVERRIDE_CAPABILITY_UNLOCKED",
  USER_OVERRIDE_BLOCKED = "USER_OVERRIDE_BLOCKED",
  USER_OVERRIDE_UNBLOCKED = "USER_OVERRIDE_UNBLOCKED",

  // Abuse detection
  ABUSE_THRESHOLD_EXCEEDED = "ABUSE_THRESHOLD_EXCEEDED",
  AUTO_LOCK_TRIGGERED = "AUTO_LOCK_TRIGGERED",
}

export interface IOverrideAuditLog extends Document {
  // References
  pageId: Types.ObjectId;
  overrideRequestId?: Types.ObjectId;
  orderId?: Types.ObjectId;

  // Action
  action: OverrideAuditAction;

  // Actor
  performedBy?: Types.ObjectId; // User who performed action
  performedByType: "USER" | "VENDOR" | "SYSTEM";
  performedByName?: string;

  // Target
  targetUserId?: Types.ObjectId; // User affected by action
  targetUserName?: string;

  // Details
  details: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    reason?: string;
    overrideType?: string;
    reasonCode?: string;
    amount?: number;
    items?: Array<{
      productName: string;
      qty: number;
      price: number;
    }>;
    comment?: string;
    metadata?: Record<string, unknown>;
  };

  // Visibility
  visibleToVendor: boolean; // Always true for override logs
  visibleToAdmin: boolean;

  // IP/Device tracking (for security)
  ipAddress?: string;
  userAgent?: string;

  // Timestamp (no updatedAt for audit logs)
  createdAt: Date;
}

const OverrideAuditLogSchema = new Schema<IOverrideAuditLog>(
  {
    // References
    pageId: {
      type: Schema.Types.ObjectId,
      ref: "Page",
      required: true,
      index: true,
    },
    overrideRequestId: {
      type: Schema.Types.ObjectId,
      ref: "OverrideRequest",
      index: true,
    },
    orderId: { type: Schema.Types.ObjectId, ref: "Order" },

    // Action
    action: {
      type: String,
      enum: Object.values(OverrideAuditAction),
      required: true,
      index: true,
    },

    // Actor
    performedBy: {
      type: Schema.Types.ObjectId,
      // Note: refPath would require a field containing the model name
      // Since we use performedByType enum, we'll handle population manually in services
      ref: "User", // Default ref, actual model depends on performedByType
    },
    performedByType: {
      type: String,
      enum: ["USER", "VENDOR", "SYSTEM"],
      required: true,
    },
    performedByName: { type: String },

    // Target
    targetUserId: { type: Schema.Types.ObjectId, ref: "User" },
    targetUserName: { type: String },

    // Details
    details: {
      type: Schema.Types.Mixed,
      default: {},
    },

    // Visibility
    visibleToVendor: { type: Boolean, default: true },
    visibleToAdmin: { type: Boolean, default: true },

    // Security
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

// Indexes for efficient querying
OverrideAuditLogSchema.index({ pageId: 1, createdAt: -1 });
OverrideAuditLogSchema.index({ overrideRequestId: 1, createdAt: -1 });
OverrideAuditLogSchema.index({ targetUserId: 1, createdAt: -1 });
OverrideAuditLogSchema.index({ pageId: 1, action: 1, createdAt: -1 });

export const OverrideAuditLog = model<IOverrideAuditLog>(
  "OverrideAuditLog",
  OverrideAuditLogSchema
);
export default OverrideAuditLog;
