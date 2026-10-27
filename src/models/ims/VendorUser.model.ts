import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";

/**
 * Vendor User Types
 * Currently only super_admin is supported, more roles can be added later
 */
export enum VendorUserType {
  SUPER_ADMIN = "super_admin",
  IMS_ADMIN = "ims_admin",
}

/**
 * Vendor User Status
 */
export enum VendorUserStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  SUSPENDED = "suspended",
}

/**
 * Vendor User Interface
 */
export interface IVendorUser extends Document {
  employeeId?: string;
  name: string;
  username?: string;
  email?: string;
  password: string;
  phoneNumber?: string;
  dateOfBirth?: Date;
  userType: VendorUserType;
  status: VendorUserStatus;
  isActive: boolean;
  isEmailVerified: boolean;
  vendorPermissions: string[]; // Array of permission/route keys
  autoAddToPortals?: boolean; // When true, automatically assigned as portal admin to all portals
  lastLoginAt?: Date;
  isOnLeave?: boolean;
  leaveStartDate?: Date;
  leaveEndDate?: Date;
  leaveNotes?: string;
  employmentConfirmedAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  // Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
}

/**
 * Vendor User Schema
 */
const VendorUserSchema = new Schema<IVendorUser>(
  {
    employeeId: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },

    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name cannot exceed 100 characters"],
    },

    username: {
      type: String,
      lowercase: true,
      trim: true,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
      index: true,
      validate: {
        validator: function (v: string) {
          if (!v || v.trim() === "") return true;
          return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v);
        },
        message: "Please provide a valid email address",
      },
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: [8, "Password must be at least 8 characters"],
      select: false, // Don't include password in queries by default
    },

    phoneNumber: {
      type: String,
      trim: true,
      validate: {
        validator: function (v: string) {
          if (!v || v.trim() === "") return true;
          return /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{2,5}[-\s\.]?[0-9]{3,7}$/.test(v.replace(/\s+/g, ""));
        },
        message: "Please provide a valid phone number",
      },
    },

    dateOfBirth: {
      type: Date,
    },

    userType: {
      type: String,
      required: true,
      default: VendorUserType.IMS_ADMIN,
    },

    status: {
      type: String,
      enum: Object.values(VendorUserStatus),
      default: VendorUserStatus.ACTIVE,
      index: true,
    },

    isActive: {
      type: Boolean,
      default: true,
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    vendorPermissions: {
      type: [String],
      default: [],
    },

    autoAddToPortals: {
      type: Boolean,
      default: false,
    },

    lastLoginAt: {
      type: Date,
    },
    isOnLeave: {
      type: Boolean,
      default: false,
    },
    leaveStartDate: {
      type: Date,
    },
    leaveEndDate: {
      type: Date,
    },
    leaveNotes: {
      type: String,
      trim: true,
    },
    employmentConfirmedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for better query performance
VendorUserSchema.index({ userType: 1, status: 1 });
VendorUserSchema.index({ email: 1, status: 1 });
VendorUserSchema.index(
  { username: 1 },
  {
    unique: true,
    partialFilterExpression: { username: { $type: "string" } },
    background: true,
  }
);
VendorUserSchema.index(
  { employeeId: 1 },
  {
    unique: true,
    partialFilterExpression: { employeeId: { $type: "string" } },
    background: true,
  }
);

/**
 * Pre-validate hook: normalize empty string email, username, and employeeId to undefined
 */
VendorUserSchema.pre<IVendorUser>("validate", function (next) {
  if (this.email === "" || this.email === null) {
    this.email = undefined;
  }
  if (this.username === "" || this.username === null) {
    this.username = undefined;
  }
  if (this.employeeId === "" || this.employeeId === null) {
    this.employeeId = undefined;
  }
  next();
});

/**
 * Pre-save hook: Hash password, sync status/isActive, and auto-generate employeeId
 */
VendorUserSchema.pre<IVendorUser>("save", async function (next) {
  // Auto-generate employeeId if not present
  if (!this.employeeId) {
    const parts = (this.name || "IMS User").trim().split(/\s+/);
    const first = parts[0]?.[0]?.toUpperCase() || "I";
    const last = parts[1]?.[0]?.toUpperCase() || parts[0]?.[1]?.toUpperCase() || "M";
    const rand = Math.floor(1000 + Math.random() * 9000);
    this.employeeId = `IMS-${first}${last}${rand}`;
  }

  // Keep status and isActive in sync
  if (this.isModified("status") && this.status) {
    this.isActive = this.status === VendorUserStatus.ACTIVE;
  } else if (this.isModified("isActive")) {
    this.status = this.isActive
      ? VendorUserStatus.ACTIVE
      : VendorUserStatus.INACTIVE;
  }

  // Hash password if modified
  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  next();
});

/**
 * Method to compare passwords
 */
VendorUserSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * JSON transformation - remove sensitive data
 */
VendorUserSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc: any, ret: any) {
    delete ret.password;
    delete ret.__v;
    return ret;
  },
});

export const VendorUser = mongoose.model<IVendorUser>(
  "VendorUser",
  VendorUserSchema,
);
export default VendorUser;
