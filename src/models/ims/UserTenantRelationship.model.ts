import { Schema, model, Document, Types } from "mongoose";

/**
 * UserTenantRelationship Model
 *
 * Purpose: Tracks relationships between users and pages (pages serve as tenants),
 * including role assignments at the page level.
 *
 * Relationships:
 * - userId: User (ref: User)
 * - pageId: Page this user belongs to (ref: Page)
 * - pageIds: Additional pages this user has access to (ref: Page)
 * - employeeGroupId: Employee group (ref: EmployeeGroup)
 */
export enum TenantRole {
  VENDOR = "vendor", // Super Admin (vendor-level, owns all logic)
  ADMIN = "admin", // Portal Admin (tenant-level, customer scope only)
  EMPLOYEE = "employee", // End user (tenant-level, via groups)
}

export interface IUserTenantRelationship extends Document {
  userId: Types.ObjectId; // ref: User
  pageId: Types.ObjectId; // Page this user belongs to (ref: Page)

  role: TenantRole;

  pageIds: Types.ObjectId[]; // Additional pages this user has access to (ref: Page)

  employeeGroupId?: Types.ObjectId; // ref: EmployeeGroup

  // Status
  isActive: boolean;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const UserTenantRelationshipSchema = new Schema<IUserTenantRelationship>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    pageId: {
      type: Schema.Types.ObjectId,
      ref: "Page",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: Object.values(TenantRole),
      required: true,
      index: true,
    },
    pageIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Page",
      },
    ],
    employeeGroupId: {
      type: Schema.Types.ObjectId,
      ref: "EmployeeGroup",
      sparse: true,
      index: true,
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
UserTenantRelationshipSchema.index({ userId: 1, pageId: 1 }, { unique: true });
UserTenantRelationshipSchema.index({ pageId: 1, role: 1 });
UserTenantRelationshipSchema.index({ userId: 1, isActive: 1 });
UserTenantRelationshipSchema.index({ pageId: 1, isActive: 1 });
UserTenantRelationshipSchema.index({ employeeGroupId: 1 });

// Validation: Ensure employeeGroupId exists only for EMPLOYEE role
UserTenantRelationshipSchema.pre("save", function (next) {
  if (this.role === TenantRole.EMPLOYEE && !this.employeeGroupId) {
    return next(new Error("employeeGroupId is required for EMPLOYEE role"));
  }
  if (this.role !== TenantRole.EMPLOYEE && this.employeeGroupId) {
    // Clear employeeGroupId if not applicable
    this.employeeGroupId = undefined;
  }
  next();
});

// Validation: Ensure VENDOR role users don't have employeeGroupId
UserTenantRelationshipSchema.pre("save", function (next) {
  if (this.role === TenantRole.VENDOR && this.employeeGroupId) {
    return next(
      new Error("VENDOR role users cannot belong to employee groups"),
    );
  }
  next();
});

export const UserTenantRelationship = model<IUserTenantRelationship>(
  "UserTenantRelationship",
  UserTenantRelationshipSchema,
);
export default UserTenantRelationship;
