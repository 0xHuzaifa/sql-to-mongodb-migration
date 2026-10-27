import { Schema, model, Document, Types } from "mongoose";

export enum PurchasePermission {
  ADMIN_ONLY = "admin_only", // Only portal admin can buy for their staff
  EVERYONE_WITH_APPROVAL = "everyone_with_approval", // Everyone can buy but needs admin approval
  EVERYONE = "everyone", // Everyone can buy without approval
}

export interface IPageUsers {
  admins: Types.ObjectId[];
  officers: Types.ObjectId[];
  pendingApprovals?: Array<{
    userId?: Types.ObjectId;
    email: string;
    addedBy: Types.ObjectId;
    addedAt: Date;
    status: "pending" | "approved" | "rejected";
  }>;
}

export interface IPage extends Document {
  title: string;
  slug: string;
  description?: string;
  /** Portal logo URL (uploaded during page creation) */
  logoUrl?: string;
  productIds: Types.ObjectId[];
  featuredProductIds?: Types.ObjectId[];

  // Tenant/Organization (optional, for rule-driven pages)
  tenantCode?: string;
  contactEmail?: string;
  contactPhone?: string;
  taxExemptNumber?: string;
  companyContact?: string;
  companyAddress?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
  };

  createdBy: Types.ObjectId;
  vendorId?: Types.ObjectId;

  // Creation flow state (optional)
  creationStep?:
    | "customers"
    | "admins"
    | "products"
    | "rules"
    | "ready"
    | "published";

  // Template and Permissions
  template: {
    purchasePermission: PurchasePermission;
    requiresApproval: boolean;
    approvalWorkflow?: {
      autoApprove: boolean;
      approvalThreshold?: number;
      notifyAdmins: boolean;
      requiredApprovers?: number;
    };
  };

  // Notification Settings
  notificationSettings?: {
    sendEmailToAdminsOnly?: boolean;
  };

  // Portal-level Email Configuration
  emailConfig?: {
    /** Additional recipient email for all order/status emails for this portal */
    receivableEmail?: string;
    /** Portal-specific SMTP. If set, all order emails for this portal use this SMTP instead of global .env */
    smtp?: {
      host: string;
      port: number;
      secure: boolean;
      user: string;
      /** AES-256-GCM encrypted password. Never store plain text. */
      encryptedPassword: string;
      from: string;
    };
  };

  // User Management
  users: IPageUsers;

  // Configuration references (optional)
  buyerEligibilityConfigId?: Types.ObjectId;
  allotmentId?: Types.ObjectId;

  // Override Configuration
  overrideConfig?: {
    enabled: boolean;
    allowedFor: ("admin" | "officer")[];
    /** Officer override requires portal admin approval (not vendor). Admin override needs no approval. */
    requiresVendorApproval: boolean;
    /** When "Everyone can buy" or "Employee requires admin approval": number of portal admin approvals required for officer override (1–3). Order proceeds only after this many approvals. */
    approvalLevels?: 1 | 2 | 3;
    reasonCodes?: Array<{
      code: string;
      label: string;
      description?: string;
      isActive: boolean;
    }>;
    isLocked: boolean;
    lockedReason?: string;
    lockedAt?: Date;
    lockedBy?: Types.ObjectId;
  };

  // Inactivity Security Review Settings
  inactiveUserThresholdDays?: number;
  enableInactiveAutoFlag?: boolean;

  // Published snapshot (optional)
  publishedConfig?: {
    publishedAt: Date;
    publishedBy: Types.ObjectId;
    snapshot: {
      productIds: Types.ObjectId[];
      adminIds: Types.ObjectId[];
      buyerEligibilityConfigId?: Types.ObjectId;
      allotmentId?: Types.ObjectId;
    };
  };

  status: "draft" | "published" | "archived";
  layout: "grid" | "list" | "masonry" | "carousel";
  theme?: {
    primaryColor?: string;
    secondaryColor?: string;
    fontFamily?: string;
  };
  seo?: {
    metaTitle?: string;
    metaDescription?: string;
    metaKeywords?: string[];
    ogImage?: string;
  };
  filters?: {
    categories?: string[];
    brands?: string[];
    priceRange?: {
      min?: number;
      max?: number;
    };
    attributes?: Array<{
      key: string;
      values: string[];
    }>;
  };
  sortOrder?: {
    field: "name" | "price" | "createdAt" | "popularity" | "custom";
    direction: "asc" | "desc";
    customOrder?: Types.ObjectId[]; // For manual ordering
  };
  visibility?: {
    startDate?: Date;
    endDate?: Date;
    geoRestrictions?: string[]; // Country codes
    customerGroups?: string[];
  };
  analytics?: {
    views: number;
    conversions: number;
    lastViewed?: Date;
  };
  /** Shipment / delivery locations for this portal (admin-managed, can add n locations) */
  shipmentLocations?: string[];
  customFields?: Map<string, any>;
  isActive: boolean;
  publishedAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  // Methods
  isVisible(): boolean;
  isAdmin(userId: string): boolean;
  canPurchase(userId: string): boolean;
  requiresApproval(userId: string, amount?: number): boolean;
  addUser(
    email: string,
    role: "admin" | "officer",
    addedBy: string,
  ): Promise<void>;
  approveUser(
    userId: string,
    email: string,
    role: "admin" | "officer",
  ): Promise<void>;
  removeUser(userId: string): Promise<void>;
  publish(publishedBy: Types.ObjectId): Promise<void>;
}

const PageSchema = new Schema<IPage>(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9-]+$/,
      index: true,
    },
    description: {
      type: String,
      maxlength: 1000,
    },
    logoUrl: {
      type: String,
      trim: true,
    },
    inactiveUserThresholdDays: {
      type: Number,
      default: 30,
    },
    enableInactiveAutoFlag: {
      type: Boolean,
      default: true,
    },
    tenantCode: {
      type: String,
      trim: true,
      uppercase: true,
      match: /^[A-Z0-9_]+$/,
      sparse: true,
      index: true,
    },
    contactEmail: { type: String, lowercase: true, trim: true, sparse: true },
    contactPhone: { type: String, trim: true },
    taxExemptNumber: { type: String, trim: true, default: "" },
    companyContact: { type: String, trim: true, default: "" },
    companyAddress: { type: String, trim: true, default: "" },
    address: {
      street: String,
      city: String,
      state: String,
      country: String,
      zipCode: String,
    },
    productIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    featuredProductIds: [
      {
        type: Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    vendorId: {
      type: Schema.Types.ObjectId,
      ref: "Vendor",
      sparse: true,
      index: true,
    },
    creationStep: {
      type: String,
      enum: ["customers", "admins", "products", "rules", "ready", "published"],
      default: "customers",
      index: true,
    },

    // Template and Permissions
    template: {
      purchasePermission: {
        type: String,
        enum: Object.values(PurchasePermission),
        default: PurchasePermission.EVERYONE,
        required: true,
      },
      requiresApproval: {
        type: Boolean,
        default: false,
      },
      approvalWorkflow: {
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
    },

    // Notification Settings
    notificationSettings: {
      sendEmailToAdminsOnly: {
        type: Boolean,
        default: false,
      },
    },

    // Portal-level Email Configuration
    emailConfig: {
      receivableEmail: {
        type: String,
        trim: true,
        lowercase: true,
      },
      smtp: {
        host: { type: String, trim: true },
        port: { type: Number },
        secure: { type: Boolean, default: true },
        user: { type: String, trim: true },
        encryptedPassword: { type: String },
        from: { type: String, trim: true },
      },
    },

    // User Management
    users: {
      admins: [
        {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      officers: [
        {
          type: Schema.Types.ObjectId,
          ref: "User",
        },
      ],
      pendingApprovals: [
        {
          userId: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: false,
          },
          email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
          },
          addedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
          },
          addedAt: {
            type: Date,
            default: Date.now,
          },
          status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
          },
        },
      ],
    },

    buyerEligibilityConfigId: {
      type: Schema.Types.ObjectId,
      ref: "BuyerEligibilityConfig",
      sparse: true,
    },
    allotmentId: {
      type: Schema.Types.ObjectId,
      ref: "Allotment",
      sparse: true,
    },
    overrideConfig: {
      enabled: { type: Boolean, default: false },
      allowedFor: {
        type: [String],
        enum: ["admin", "officer"],
        default: ["admin"],
      },
      requiresVendorApproval: { type: Boolean, default: true },
      approvalLevels: { type: Number, enum: [1, 2, 3], default: 1 },
      reasonCodes: [
        {
          code: { type: String, required: true, uppercase: true },
          label: { type: String, required: true },
          description: String,
          isActive: { type: Boolean, default: true },
        },
      ],
      isLocked: { type: Boolean, default: false },
      lockedReason: String,
      lockedAt: Date,
      lockedBy: { type: Schema.Types.ObjectId, ref: "VendorUser" },
    },
    publishedConfig: {
      publishedAt: Date,
      publishedBy: { type: Schema.Types.ObjectId, ref: "User" },
      snapshot: {
        productIds: [{ type: Schema.Types.ObjectId, ref: "Product" }],
        adminIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
        buyerEligibilityConfigId: {
          type: Schema.Types.ObjectId,
          ref: "BuyerEligibilityConfig",
        },
        allotmentId: { type: Schema.Types.ObjectId, ref: "Allotment" },
      },
    },

    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
      index: true,
    },
    layout: {
      type: String,
      enum: ["grid", "list", "masonry", "carousel"],
      default: "grid",
    },
    theme: {
      primaryColor: String,
      secondaryColor: String,
      fontFamily: String,
    },
    seo: {
      metaTitle: String,
      metaDescription: String,
      metaKeywords: [String],
      ogImage: String,
    },
    filters: {
      categories: [String],
      brands: [String],
      priceRange: {
        min: Number,
        max: Number,
      },
      attributes: [
        {
          key: String,
          values: [String],
        },
      ],
    },
    sortOrder: {
      field: {
        type: String,
        enum: ["name", "price", "createdAt", "popularity", "custom"],
        default: "createdAt",
      },
      direction: {
        type: String,
        enum: ["asc", "desc"],
        default: "desc",
      },
      customOrder: [
        {
          type: Schema.Types.ObjectId,
          ref: "Product",
        },
      ],
    },
    visibility: {
      startDate: Date,
      endDate: Date,
      geoRestrictions: [String],
      customerGroups: [String],
    },
    analytics: {
      views: {
        type: Number,
        default: 0,
      },
      conversions: {
        type: Number,
        default: 0,
      },
      lastViewed: Date,
    },
    shipmentLocations: {
      type: [String],
      default: [],
    },
    customFields: {
      type: Map,
      of: Schema.Types.Mixed,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    publishedAt: Date,
  },
  {
    timestamps: true,
  },
);

// Indexes for performance
PageSchema.index({ status: 1, isActive: 1 });
PageSchema.index({ createdBy: 1 });
PageSchema.index({ "analytics.views": -1 });
PageSchema.index({ productIds: 1 });

// Virtual for product count
PageSchema.virtual("productCount").get(function () {
  return this.productIds?.length || 0;
});

// Pre-save hook to set publishedAt
PageSchema.pre("save", function (next) {
  if (
    this.isModified("status") &&
    this.status === "published" &&
    !this.publishedAt
  ) {
    this.publishedAt = new Date();
  }
  next();
});

// Method to check if page is visible
PageSchema.methods.isVisible = function (): boolean {
  const now = new Date();

  if (!this.isActive || this.status !== "published") {
    return false;
  }

  if (this.visibility?.startDate && now < this.visibility.startDate) {
    return false;
  }

  if (this.visibility?.endDate && now > this.visibility.endDate) {
    return false;
  }

  return true;
};

// Check if user is admin of this page
PageSchema.methods.isAdmin = function (userId: string): boolean {
  return this.users.admins.some(
    (adminId: Types.ObjectId) => adminId.toString() === userId,
  );
};

// Check if user can purchase from this page
PageSchema.methods.canPurchase = function (userId: string): boolean {
  const isAdmin = this.isAdmin(userId);
  const isOfficer = this.users.officers.some(
    (officerId: Types.ObjectId) => officerId.toString() === userId,
  );

  switch (this.template.purchasePermission) {
    case PurchasePermission.ADMIN_ONLY:
      return isAdmin;
    case PurchasePermission.EVERYONE_WITH_APPROVAL:
    case PurchasePermission.EVERYONE:
      return isAdmin || isOfficer;
    default:
      return false;
  }
};

// Check if purchase requires approval
PageSchema.methods.requiresApproval = function (
  userId: string,
  amount?: number,
): boolean {
  if (
    this.template.purchasePermission ===
    PurchasePermission.EVERYONE_WITH_APPROVAL
  ) {
    // Check if auto-approve is enabled and amount is below threshold
    if (
      this.template.approvalWorkflow?.autoApprove &&
      amount &&
      this.template.approvalWorkflow.approvalThreshold &&
      amount <= this.template.approvalWorkflow.approvalThreshold
    ) {
      return false;
    }
    return true;
  }

  // For ADMIN_ONLY, no approval is needed since only admins can purchase
  if (this.template.purchasePermission === PurchasePermission.ADMIN_ONLY) {
    return false;
  }

  return false;
};

// Add user to page (admin or officer)
PageSchema.methods.addUser = async function (
  email: string,
  role: "admin" | "officer",
  addedBy: string,
): Promise<void> {
  // Check if user already exists in pending approvals
  const pendingIndex = this.users.pendingApprovals?.findIndex(
    (pending: any) => pending.email === email && pending.status === "pending",
  );

  if (pendingIndex !== undefined && pendingIndex >= 0) {
    throw new Error("User already has a pending invitation");
  }

  // Add to pending approvals
  this.users.pendingApprovals = this.users.pendingApprovals || [];
  this.users.pendingApprovals.push({
    email,
    addedBy,
    addedAt: new Date(),
    status: "pending",
  });

  await this.save();
};

// Approve user access
PageSchema.methods.approveUser = async function (
  userId: string,
  email: string,
  role: "admin" | "officer",
): Promise<void> {
  // Find pending approval
  const pendingIndex = this.users.pendingApprovals?.findIndex(
    (pending: any) => pending.email === email && pending.status === "pending",
  );

  if (pendingIndex === undefined || pendingIndex < 0) {
    throw new Error("No pending approval found for this user");
  }

  // Update pending approval status
  this.users.pendingApprovals[pendingIndex].status = "approved";
  this.users.pendingApprovals[pendingIndex].userId = userId;

  // Add user to appropriate array
  if (role === "admin") {
    this.users.admins.push(userId);
  } else {
    this.users.officers.push(userId);
  }

  await this.save();
};

// Remove user from page
PageSchema.methods.removeUser = async function (userId: string): Promise<void> {
  // Remove from admins
  this.users.admins = this.users.admins.filter(
    (adminId: Types.ObjectId) => adminId.toString() !== userId,
  );

  // Remove from officers
  this.users.officers = this.users.officers.filter(
    (officerId: Types.ObjectId) => officerId.toString() !== userId,
  );

  await this.save();
};

// Publish page (create immutable snapshot)
PageSchema.methods.publish = async function (
  publishedBy: Types.ObjectId,
): Promise<void> {
  // Allow re-publishing to update snapshot
  if (this.status === "published") {
    console.log(
      `[PAGE_MODEL] Updating snapshot for already published page: ${this._id}`,
    );
  }

  this.status = "published";
  this.publishedAt = new Date();
  if (this.creationStep) {
    this.creationStep = "published";
  }

  this.publishedConfig = {
    publishedAt: new Date(),
    publishedBy,
    snapshot: {
      productIds: [...(this.productIds || [])],
      adminIds: [...(this.users?.admins || [])],
      buyerEligibilityConfigId: this.buyerEligibilityConfigId,
      allotmentId: this.allotmentId,
    },
  };

  return this.save();
};

// Static method to find published pages
PageSchema.statics.findPublished = function () {
  return this.find({
    status: "published",
    isActive: true,
  });
};

// Static method to find pages by user
PageSchema.statics.findByUser = function (userId: string) {
  return this.find({
    $or: [{ "users.admins": userId }, { "users.officers": userId }],
    isActive: true,
  });
};

export const Page = model<IPage>("Page", PageSchema);
