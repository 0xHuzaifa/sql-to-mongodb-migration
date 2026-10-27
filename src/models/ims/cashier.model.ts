// src/models/cashier.model.ts
import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export interface ICashierPrivileges {
  canApplyDiscount: boolean;
  canVoidTransaction: boolean;
  canIssueRefund: boolean;
  canOverridePrice: boolean;
  canViewReports: boolean;
  canManageDrawer: boolean;
  canManageClosingBalance: boolean;
  canApplyGlobalDiscount: boolean;
  canSuspendCart: boolean;
  canProcessSales: boolean;
  canReviewOrders: boolean;
  canUseCompanyPortal: boolean;
  canAddProduct: boolean;
  canSeeWarehouseLocations: boolean;
  canUpdateStock: boolean;
  canAddCompanyToWalkIn: boolean;
  canManageGiftCards: boolean;
  canTailor: boolean;
  maxDiscountPercent: number;
}

export interface ICashier extends Document {
  // Identity
  employeeId: string;
  badgeCode?: string;
  username?: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email?: string;
  contact?: string;
  password: string;

  // Vendor Scope
  vendorId: mongoose.Types.ObjectId;

  // Counter / Terminal Assignment
  counterNo: number;
  counterName?: string;
  hasCardMachine: boolean;
  cardMachineId?: string;
  hasScanner: boolean;
  scannerModel?: string;
  drawerCashLimit: number;
  openingFloat: number;
  role: string;

  // Permissions
  withPrivileges: boolean;
  privileges: ICashierPrivileges;

  // Status & Security
  isActive: boolean;
  isFirstLogin: boolean;
  passwordChangedAt?: Date;
  lastLoginAt?: Date;
  lastLoginIP?: string;
  failedLoginAttempts: number;
  lockedUntil?: Date;
  passwordResetToken?: string;
  passwordResetExpiresAt?: Date;
  // Vacation / Leave & Employment Security
  isOnLeave?: boolean;
  leaveStartDate?: Date;
  leaveEndDate?: Date;
  leaveNotes?: string;
  employmentConfirmedAt?: Date;

  createdAt: Date;
  updatedAt: Date;

  // EOD Email Routing
  assignedManagerEmail?: string;
  storeManagerEmails?: string[];

  // Instance Methods
  comparePassword(candidatePassword: string): Promise<boolean>;
  generatePasswordResetToken(): string;
}

export const CashierPrivilegesSchema = new Schema<ICashierPrivileges>(
  {
    canApplyDiscount: { type: Boolean, default: false },
    canVoidTransaction: { type: Boolean, default: false },
    canIssueRefund: { type: Boolean, default: false },
    canOverridePrice: { type: Boolean, default: false },
    canViewReports: { type: Boolean, default: false },
    canManageDrawer: { type: Boolean, default: false },
    canManageClosingBalance: { type: Boolean, default: false },
    canApplyGlobalDiscount: { type: Boolean, default: false },
    canSuspendCart: { type: Boolean, default: false },
    canProcessSales: { type: Boolean, default: true },
    canReviewOrders: { type: Boolean, default: false },
    canUseCompanyPortal: { type: Boolean, default: false },
    canAddProduct: { type: Boolean, default: false },
    canSeeWarehouseLocations: { type: Boolean, default: false },
    canUpdateStock: { type: Boolean, default: false },
    canAddCompanyToWalkIn: { type: Boolean, default: false },
    canManageGiftCards: { type: Boolean, default: false },
    canTailor: { type: Boolean, default: false },
    maxDiscountPercent: { type: Number, default: 0 },
  },
  { _id: false }
);

const CashierSchema = new Schema<ICashier>(
  {
    employeeId: {
      type: String,
      unique: true,
      trim: true,
    },

    badgeCode: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },

    username: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
      index: true,
    },

    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },

    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
    },

    displayName: {
      type: String,
      trim: true,
    },

    email: {
      type: String,
      lowercase: true,
      trim: true,
      sparse: true,
      index: true,
    },

    contact: {
      type: String,
      trim: true,
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      select: false,
    },

    vendorId: {
      type: Schema.Types.ObjectId,
      ref: "Vendor",
      required: [true, "Vendor ID is required"],
      index: true,
    },

    counterNo: {
      type: Number,
      required: [true, "Counter number is required"],
    },

    counterName: {
      type: String,
      trim: true,
    },

    hasCardMachine: {
      type: Boolean,
      default: false,
    },

    cardMachineId: {
      type: String,
      trim: true,
    },

    hasScanner: {
      type: Boolean,
      default: true,
    },

    scannerModel: {
      type: String,
      trim: true,
    },

    drawerCashLimit: {
      type: Number,
      default: 0,
    },

    openingFloat: {
      type: Number,
      default: 0,
    },

    role: {
      type: String,
      default: 'cashier',
      index: true,
    },

    assignedManagerEmail: {
      type: String,
      trim: true,
    },

    storeManagerEmails: {
      type: [String],
      default: [],
    },


    withPrivileges: {
      type: Boolean,
      default: false,
    },

    privileges: {
      type: CashierPrivilegesSchema,
      default: () => ({}),
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    isFirstLogin: {
      type: Boolean,
      default: true,
    },

    passwordChangedAt: {
      type: Date,
    },

    lastLoginAt: {
      type: Date,
    },

    lastLoginIP: {
      type: String,
    },

    failedLoginAttempts: {
      type: Number,
      default: 0,
    },

    lockedUntil: {
      type: Date,
    },

    passwordResetToken: {
      type: String,
      select: false,
    },

    passwordResetExpiresAt: {
      type: Date,
      select: false,
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
  { timestamps: true },
);

// Compound index: email per vendor (non-unique)
CashierSchema.index({ email: 1, vendorId: 1 });
CashierSchema.index({ vendorId: 1, isActive: 1 });
CashierSchema.index({ vendorId: 1, counterNo: 1 });

/**
 * Pre-save hook: hash password, auto-generate employeeId and displayName
 */
CashierSchema.pre<ICashier>("save", async function (next) {
  // Auto-generate employeeId if not present
  if (!this.employeeId) {
    const first = this.firstName?.[0]?.toUpperCase() || "X";
    const last = this.lastName?.[0]?.toUpperCase() || "X";
    const rand = Math.floor(1000 + Math.random() * 9000);
    this.employeeId = `CSH-${first}${last}${rand}`;
  }

  // Auto-generate displayName if not present
  if (!this.displayName) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    this.displayName = `${this.firstName} ${this.lastName} #${rand}`;
  }

  // Hash password if modified
  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    this.passwordChangedAt = new Date();
  }

  next();
});

/**
 * Compare incoming password with stored hash
 */
CashierSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Generate a password reset token, hash it, store hash, set 1-hour expiry.
 * Returns the raw (unhashed) token to send in the email.
 */
CashierSchema.methods.generatePasswordResetToken = function (): string {
  const rawToken = crypto.randomBytes(32).toString("hex");
  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");
  this.passwordResetExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  return rawToken;
};

/**
 * JSON transformation — remove sensitive fields
 */
CashierSchema.set("toJSON", {
  virtuals: true,
  transform: function (_doc: any, ret: any) {
    delete ret.password;
    delete ret.passwordResetToken;
    delete ret.passwordResetExpiresAt;
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model<ICashier>("Cashier", CashierSchema);
