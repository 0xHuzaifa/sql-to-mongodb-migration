import mongoose, { Document, Schema, Types } from "mongoose";
import * as bcrypt from "bcryptjs";

// User roles in the system
export enum UserRole {
  SUPER_ADMIN = "super_admin", // Main IMS_POS admin who creates portals
  PORTAL_ADMIN = "portal_admin", // Admin of a specific portal/page
  OFFICER = "officer", // Officers who buy from portals
}

// Size information for uniforms
export interface ISizeInfo {
  standardSize?: "XS" | "S" | "M" | "L" | "XL" | "XXL" | "XXXL";
  height?: number; // in cm
  weight?: number; // in kg
  chest?: number; // in cm
  waist?: number; // in cm
  shoulder?: number; // in cm
  armLength?: number; // in cm
  inseam?: number; // in cm
  shoeSize?: string;
}

export interface IUser extends Document {
  // Basic Information (Required)
  officerId: string;
  username?: string;
  email: string;
  password: string;
  name: string;

  // Role: only used for super_admin (IMS main admin). Portal role is derived from Page.users.admins/officers per portal.
  role?: UserRole;

  // Important Dates (for allotment rollover)
  dateOfBirth?: Date;

  allotmentRolloverDate?: Date; // DEPRECATED: Use portalRenewalConfigs instead. When allotment renews for this user

  // Portal-specific settings (multi-portal support)
  portalSettings?: Array<{
    portalId: Types.ObjectId; // ref: Page
    role?: UserRole; // Role in this specific portal
    permissions?: string[]; // Array of allowed sidebar section IDs
    employeeGroupIds?: Types.ObjectId[]; // Groups in this specific portal (ref: EmployeeGroup)
    rank?: string; // Rank in this specific portal
    anniversaryDate?: Date;
    inviteSent?: boolean;
    // Renewal/Rollover Configuration
    renewalType?: "annual" | "monthly" | "auto" | "none"; // Type of renewal
    renewalDate?: Date; // Calculated effective renewal date
    renewalDateType?: "anniversarydate" | "customdate"; // Which date to use as renewal (legacy)
    customRenewalDate?: Date; // Custom renewal date (used when renewalDateType is customdate)
    periodSubType?: "from_creation" | "calendar_start"; // For annual/monthly renewal (legacy)
    autoDateField?: "dateOfBirth" | "anniversaryDate"; // For auto renewal
    autoDateValue?: Date; // The actual value from the selected date field
  }>;

  // Location Information
  policeStation?: {
    name: string;
    address: string;
    district?: string;
    state?: string;
    pincode?: string;
  };

  // Personal Information
  personalAddress?: {
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
    phone?: string;
  };

  // Size Information for Uniforms
  sizeInfo?: ISizeInfo;

  // Discount and Tax Details
  discountPercent?: number;
  isTaxExempt?: boolean;
  taxId?: string;
  taxExemptCategory?: string;

  // Page Access
  assignedPortals?: Types.ObjectId[]; // Pages this user has access to (ref: Page)

  // Tenant/Page Relationship
  tenantId?: Types.ObjectId; // Page this user belongs to (ref: Page)
  employeeGroupIds?: Types.ObjectId[]; // Employee groups (if user is an employee) (ref: EmployeeGroup)

  // Employee fields
  department?: string;
  assignedLocationId?: Types.ObjectId; // Location assignment (ref: Location)
  /** Up to 3 locations; if multiple, user is a floater */
  locations?: string[];
  /** True when user has multiple locations assigned */
  isFloater?: boolean;
  /** Contact numbers (phone book) – e.g. [{ phone, type }] */
  contact?: { phone: string; type: string }[];
  /** Effective renewal date (either anniversaryDate or customRenewalDate based on renewalDateType) */
  renewalDate?: Date;
  /** Dropdown: "anniversarydate" | "customdate" – which date to use as renewal */
  renewalDateType?: "anniversarydate" | "customdate";
  /** Custom renewal date (used when renewalDateType is customdate) */
  customRenewalDate?: Date;

  // Credits Reference
  creditAccount?: Types.ObjectId; // Reference to Credit model

  // For Admins: Track officers they manage and purchases made for them
  managedOfficers?: {
    officerId: Types.ObjectId;
    email: string;
    assignedAt: Date;
  }[];
  purchasesForOfficers?: {
    orderId: Types.ObjectId;
    officerId: Types.ObjectId;
    amount: number;
    createdAt: Date;
  }[];

  // Status
  status?: "active" | "inactive";
  isActive: boolean;
  isVerified: boolean;
  // Vacation / Leave & Employment Security
  isOnLeave?: boolean;
  leaveStartDate?: Date;
  leaveEndDate?: Date;
  leaveNotes?: string;
  employmentConfirmedAt?: Date;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;

  // Methods
  hasAccessToPortal(pageId: string): boolean;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    // Basic Information
    officerId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    // Role removed from schema – portal role is derived from Page.users.admins / Page.users.officers per portal.
    // Legacy: role may still exist on existing docs (e.g. super_admin); new portal users are not given role.

    // Important Dates (for allotment rollover)
    dateOfBirth: {
      type: Date,
    },

    allotmentRolloverDate: {
      type: Date,
    },

    // Portal-specific settings (multi-portal support)
    portalSettings: [
      {
        portalId: {
          type: Schema.Types.ObjectId,
          ref: "Page",
          required: true,
        },
        role: {
          type: String,
          enum: Object.values(UserRole),
        },
        permissions: {
          type: [String],
          default: [],
        },
        employeeGroupIds: [
          {
            type: Schema.Types.ObjectId,
            ref: "EmployeeGroup",
          },
        ],
        rank: {
          type: String,
          trim: true,
        },
        anniversaryDate: {
          type: Date,
        },
        inviteSent: {
          type: Boolean,
          default: false,
        },
        // Renewal/Rollover Configuration
        renewalType: {
          type: String,
          enum: ["annual", "monthly", "auto", "none"],
        },
        renewalDate: {
          type: Date,
        },
        renewalDateType: {
          type: String,
          enum: ["anniversarydate", "customdate"],
        },
        customRenewalDate: {
          type: Date,
        },
        periodSubType: {
          type: String,
          enum: ["from_creation", "calendar_start"],
        },
        autoDateField: {
          type: String,
          enum: ["dateOfBirth", "anniversaryDate"],
        },
        autoDateValue: {
          type: Date,
        },
      },
    ],

    // Location Information
    policeStation: {
      name: { type: String },
      address: { type: String },
      district: { type: String },
      state: { type: String },
      pincode: { type: String },
    },

    // Personal Information
    personalAddress: {
      street: { type: String },
      city: { type: String },
      state: { type: String },
      pincode: { type: String },
      phone: { type: String },
    },

    // Discount and Tax Details
    discountPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    isTaxExempt: {
      type: Boolean,
      default: false,
    },
    taxId: {
      type: String,
      default: "",
    },
    taxExemptCategory: {
      type: String,
      default: "none",
    },

    // Size Information
    sizeInfo: {
      standardSize: {
        type: String,
        enum: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
      },
      height: { type: Number }, // in cm
      weight: { type: Number }, // in kg
      chest: { type: Number }, // in cm
      waist: { type: Number }, // in cm
      shoulder: { type: Number }, // in cm
      armLength: { type: Number }, // in cm
      inseam: { type: Number }, // in cm
      shoeSize: { type: String },
    },

    // Page Access
    assignedPortals: [
      {
        type: Schema.Types.ObjectId,
        ref: "Page",
      },
    ],

    employeeGroupIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "EmployeeGroup",
        index: true,
      },
    ],

    // Employee fields
    department: {
      type: String,
      trim: true,
    },
    assignedLocationId: {
      type: Schema.Types.ObjectId,
      ref: "Location",
      sparse: true,
      index: true,
    },
    locations: {
      type: [String],
      default: [],
      validate: {
        validator: (v: string[]) => v.length <= 3,
        message: "User can have at most 3 locations",
      },
    },
    isFloater: {
      type: Boolean,
      default: false,
    },

    contact: {
      type: [
        {
          phone: { type: String, trim: true },
          type: { type: String, trim: true },
        },
      ],
      default: [],
    },

    // Credits Reference
    creditAccount: {
      type: Schema.Types.ObjectId,
      ref: "Credit",
    },

    // For Admins: Track officers they manage and purchases made for them
    managedOfficers: [
      {
        officerId: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
        email: String,
        assignedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    purchasesForOfficers: [
      {
        orderId: {
          type: Schema.Types.ObjectId,
          ref: "Order",
        },
        officerId: {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
        amount: Number,
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Status
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    isVerified: {
      type: Boolean,
      default: false,
    },

    // Timestamps
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
UserSchema.index({ role: 1, isActive: 1 });
UserSchema.index({ status: 1, role: 1 });
UserSchema.index({ assignedPortals: 1 });
UserSchema.index({ tenantId: 1 });
UserSchema.index({ employeeGroupIds: 1 });
UserSchema.index({ "portalRenewalConfigs.portalId": 1 }); // For querying users by portal renewal config

// Pre-save hook: sync status/isActive + hash password if modified
UserSchema.pre<IUser>("save", async function (next) {
  // Keep status and isActive in sync (backward compatible)
  if (this.isModified("status") && this.status) {
    this.isActive = this.status === "active";
  } else if (this.isModified("isActive")) {
    this.status = this.isActive ? "active" : "inactive";
  } else if (!this.status) {
    // ensure status exists for old records
    this.status = this.isActive ? "active" : "inactive";
  }

  if (this.isModified("locations")) {
    const locs = this.locations || [];
    this.isFloater = locs.length > 1;
  }

  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  // Capitalize name
  if (this.isModified("name") && this.name) {
    this.name = this.name
      .split(' ')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  next();
});

// Method to compare passwords
UserSchema.methods.comparePassword = async function (
  candidatePassword: string,
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// Virtual for display name
UserSchema.virtual("displayName").get(function (this: IUser) {
  return this.name;
});

// Method to check if user has access to a specific page
UserSchema.methods.hasAccessToPortal = function (pageId: string): boolean {
  return this.assignedPortals?.some(
    (page: Types.ObjectId) => page.toString() === pageId,
  );
};

// JSON transformation
UserSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc: any, ret: any) {
    delete ret.__v;
    return ret;
  },
});

export const User = mongoose.model<IUser>("User", UserSchema);
export default User;
