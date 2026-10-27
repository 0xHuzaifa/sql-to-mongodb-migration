import mongoose, { Document, Schema, Types } from "mongoose";

export type PortalAuditAction =
  | "user_added"
  | "user_removed"
  | "user_activated"
  | "user_deactivated"
  | "user_updated"
  | "role_changed";

export interface IPortalAuditLog extends Document {
  pageId: Types.ObjectId;
  action: PortalAuditAction;
  targetUserId: Types.ObjectId;
  performedBy?: Types.ObjectId;
  details?: Record<string, unknown>;
  createdAt: Date;
}

const PortalAuditLogSchema = new Schema<IPortalAuditLog>(
  {
    pageId: {
      type: Schema.Types.ObjectId,
      ref: "Page",
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ["user_added", "user_removed", "user_activated", "user_deactivated", "user_updated", "role_changed"],
      required: true,
      index: true,
    },
    targetUserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    details: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

PortalAuditLogSchema.index({ pageId: 1, createdAt: -1 });

export const PortalAuditLog = mongoose.model<IPortalAuditLog>("PortalAuditLog", PortalAuditLogSchema);
export default PortalAuditLog;
