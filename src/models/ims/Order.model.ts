// src/models/Order.model.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IOrderItem {
  variantId: mongoose.Types.ObjectId;
  sku: string;
  qty: number;
  price: number;
  vendorId?: mongoose.Types.ObjectId; // Assigned after routing
  /** Name of the product for display (not persisted by default but used in emails)
   * populated when orderItems are constructed in services/controllers
   */
  productName?: string;
  /** Selected size for this line (e.g. "L", "32") */
  size?: string;
  /** Selected color for this line (e.g. "black", "navy blue") */
  color?: string;
  length?: string;
  notes?: string;
  status?: string;
  isUnlimitedPurchase?: boolean; // Flag if purchased via unlimited allotment
  itemType?: "regular_sale" | "order" | "layaway" | "backorder" | "hold" | "alteration_required";
  itemStatus?: "ordered" | "backordered" | "received" | "in_alteration" | "hold_section" | "ready_for_pickup" | "picked_up" | "cancelled";
  fulfillment?: {
    fulfilledQty: number;
    pendingQty: number;
    fulfilledAt?: Date;
    pickedUpBy?: string;
  };
  garmentStage?: "pending" | "embroidery" | "tailoring" | "hold_section" | "picked_up" | "cancelled";
  stagedAt?: Date;
  holdSectionAt?: Date;
  rackLocation?: string;
  locationId?: string;
  locationName?: string;
  layawayDetails?: {
    depositAmount: number;
    balanceRemaining: number;
    dueDate?: Date;
    minimumDepositPercent?: number;
  };
}

/** Mandatory alteration add-on (product or service) attached to an order */
export interface IMandatoryAlterationOrderItem {
  type: "product" | "service";
  variantId?: mongoose.Types.ObjectId;
  sku?: string;
  qty: number;
  price?: number;
  size?: string;
  color?: string;
  /** Name of the alteration product/service for display */
  productName?: string;
  /** The parent order item's variantId this alteration belongs to */
  parentItemVariantId?: mongoose.Types.ObjectId;
  /** For type === "service": custom service details */
  serviceProduct?: {
    name: string;
    description?: string;
    category?: string;
    subcategory?: string;
    brand?: string;
    attributes?: any[];
  };
  /** Values for custom input fields (e.g. from checkout form) */
  customInputs?: Record<string, any>;
  /** Custom input field definitions for display */
  customInputFields?: Array<{
    id: string;
    type: "label" | "input";
    inputType?: "text" | "textarea" | "number" | "select";
    label: string;
    placeholder?: string;
    isRequired?: boolean;
    options?: string[];
  }>;
}

export interface IOrder extends Document {
  userId: mongoose.Types.ObjectId;

  // Purchase Order Tracking
  autoPurchaseOrder: string;
  customPurchaseOrder: string;

  // Admin purchase tracking (when admin buys for officer)
  orderedBy?: {
    userId: mongoose.Types.ObjectId;
    email: string;
    name: string;
  };
  orderedFor?: {
    userId: mongoose.Types.ObjectId;
    email: string;
    name: string;
  };

  orderedForGroup?: mongoose.Types.ObjectId | any;

  // Portal information
  pageId?: mongoose.Types.ObjectId; // Page this order belongs to
  pageSlug?: string;

  // Purchase permission type
  purchasePermission?: "admin_only" | "everyone_with_approval" | "everyone";
  // Allotment type: money = payment/credit, unit = unit-based
  allotmentType?: "money" | "unit";
  items: IOrderItem[];
  /** Mandatory alteration add-ons (products/services) sent with the order */
  mandatoryAlterationItems?: IMandatoryAlterationOrderItem[];
  /** Package sub-products: all products inside a package order item */
  packageItems?: Array<{
    packageId: string;
    packageName: string;
    variantId: mongoose.Types.ObjectId;
    productName?: string;
    sku?: string;
    qty: number;
    size?: string;
    color?: string;
  }>;
  totalAmount: number;
  status:
    | "pending"
    | "received"
    | "in_process"
    | "embroidery"
    | "tailoring"
    | "hold_section"
    | "shipped"
    | "routed"
    | "fulfilled"
    | "returned"
    | "cancelled"
    | "backorder"
    | "taken"
    | "taken_date"
    | "in_hold_section_date"
    | "picked_up";

  garmentTracking?: {
    currentStage?: "pending" | "embroidery" | "tailoring" | "hold_section" | "picked_up" | "cancelled";
    rackLocation?: string;
    pickupSignatureUrl?: string;
    pickedUpAt?: Date;
    departmentHistory?: Array<{
      stage: string;
      timestamp: Date;
      updatedBy?: string;
      notes?: string;
      itemSku?: string;
      itemIndex?: number;
      itemIndices?: number[];
      itemSkus?: string[];
    }>;
  };

  stagedAt?: Date;
  holdSectionAt?: Date;
  facilityId?: string;
  locationId?: string;
  locationName?: string;

  // Credit and payment
  paymentMethod?: "credits" | "cash" | "bank_transfer";
  paymentReference?: string;
  ncrReference?: string;
  creditDeductedFrom?: mongoose.Types.ObjectId; // Admin's credit ID from which amount was deducted
  creditTransactionId?: string; // Reference to credit transaction

  routing?: {
    vendorAssignments: Map<string, mongoose.Types.ObjectId[]>; // vendorId -> [variantIds]
    routedAt?: Date;
  };
  dropshipStatus?: {
    isDropship: boolean;
    vendorId?: mongoose.Types.ObjectId;
    trackingNumber?: string;
    shippedAt?: Date;
  };
  approvalId?: mongoose.Types.ObjectId; // Reference to OrderApproval (NEW)

  // Override fields
  overrideRequestId?: mongoose.Types.ObjectId; // Reference to OverrideRequest
  isOverrideOrder: boolean; // Flag for override orders
  overrideType?: "USE_EXTRA_UNITS" | "PAY_YOURSELF"; // Type of override
  /** Shipping: delivered_to_department | pickup_from_vendor */
  shippingMethod?: string;
  /** Department address when shippingMethod is delivered_to_department */
  departmentInfo?: string;

  createdAt: Date;
  updatedAt: Date;
}

const OrderSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Purchase Order Tracking
    autoPurchaseOrder: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    customPurchaseOrder: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // Admin purchase tracking
    orderedBy: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
      email: String,
      name: String,
    },
    orderedFor: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
      email: String,
      name: String,
    },

    orderedForGroup: {
      type: Schema.Types.ObjectId,
      ref: "EmployeeGroup",
    },

    pageId: {
      type: Schema.Types.ObjectId,
      ref: "Page",
      index: true,
    },
    pageSlug: String,

    // Purchase permission type
    purchasePermission: {
      type: String,
      enum: ["admin_only", "everyone_with_approval", "everyone"],
    },
    allotmentType: {
      type: String,
      enum: ["money", "unit"],
      index: true,
    },
    items: [
      {
        variantId: {
          type: Schema.Types.ObjectId,
          ref: "Variant",
          required: true,
        },
        sku: { type: String, required: true, uppercase: true },
        qty: { type: Number, required: true, min: 1 },
        price: { type: Number, required: true, min: 0 },
        productName: { type: String, trim: true },
        vendorId: { type: Schema.Types.ObjectId, ref: "Vendor" },
        size: { type: String, trim: true },
        color: { type: String, trim: true, lowercase: true },
        length: { type: String, trim: true },
        notes: { type: String, trim: true },
        status: { type: String, default: "pending" },
        isUnlimitedPurchase: { type: Boolean, default: false },
        itemType: {
          type: String,
          enum: ["regular_sale", "order", "layaway", "backorder", "hold", "alteration_required"],
          default: "regular_sale",
        },
        itemStatus: {
          type: String,
          enum: ["ordered", "backordered", "received", "in_alteration", "hold_section", "ready_for_pickup", "picked_up"],
          default: "ordered",
        },
        garmentStage: {
          type: String,
          enum: ["pending", "embroidery", "tailoring", "hold_section", "picked_up"],
        },
        fulfillment: {
          fulfilledQty: { type: Number, default: 0 },
          pendingQty: { type: Number, default: 0 },
          fulfilledAt: { type: Date },
          pickedUpBy: { type: String },
        },
        rackLocation: { type: String, trim: true },
        locationId: { type: String, trim: true },
        locationName: { type: String, trim: true },
        stagedAt: { type: Date },
        holdSectionAt: { type: Date },
        layawayDetails: {
          depositAmount: { type: Number },
          balanceRemaining: { type: Number },
          dueDate: { type: Date },
          minimumDepositPercent: { type: Number, default: 20 },
        },
      },
    ],
    mandatoryAlterationItems: [
      {
        type: { type: String, enum: ["product", "service"], required: true },
        variantId: { type: Schema.Types.ObjectId, ref: "Variant" },
        sku: { type: String, uppercase: true },
        qty: { type: Number, required: true, min: 1 },
        price: { type: Number, min: 0 },
        size: { type: String, trim: true },
        color: { type: String, trim: true, lowercase: true },
        productName: { type: String, trim: true },
        parentItemVariantId: { type: Schema.Types.ObjectId, ref: "Variant" },
        serviceProduct: {
          name: String,
          description: String,
          category: String,
          subcategory: String,
          brand: String,
          attributes: [Schema.Types.Mixed],
        },
        customInputs: { type: Schema.Types.Mixed },
        customInputFields: [
          {
            id: String,
            type: { type: String, enum: ["label", "input"] },
            inputType: {
              type: String,
              enum: ["text", "textarea", "number", "select"],
            },
            label: String,
            placeholder: String,
            isRequired: Boolean,
            options: [String],
          },
        ],
      },
    ],
    totalAmount: { type: Number, required: true, min: 0 },
    packageItems: [
      {
        packageId: { type: String },
        packageName: { type: String },
        variantId: { type: Schema.Types.ObjectId, ref: "Variant" },
        productName: { type: String, trim: true },
        sku: { type: String, uppercase: true },
        qty: { type: Number, min: 1 },
        size: { type: String, trim: true },
        color: { type: String, trim: true },
      },
    ],
    status: {
      type: String,
      enum: [
        "pending",
        "received",
        "in_process",
        "embroidery",
        "tailoring",
        "hold_section",
        "shipped",
        "routed",
        "fulfilled",
        "returned",
        "cancelled",
        "backorder",
        "taken",
        "taken_date",
        "in_hold_section_date",
        "picked_up",
      ],
      default: "pending",
      index: true,
    },

    stagedAt: { type: Date },
    holdSectionAt: { type: Date },
    facilityId: { type: String, index: true },
    locationId: { type: String, index: true },
    locationName: { type: String, trim: true },
    garmentTracking: {
      currentStage: {
        type: String,
        enum: ["pending", "embroidery", "tailoring", "hold_section", "picked_up"],
        default: "pending",
      },
      rackLocation: { type: String, trim: true },
      pickupSignatureUrl: { type: String },
      pickedUpAt: { type: Date },
      departmentHistory: [
        {
          stage: { type: String, required: true },
          timestamp: { type: Date, default: Date.now },
          updatedBy: { type: String },
          notes: { type: String },
          itemSku: { type: String },
          itemIndex: { type: Number },
          itemIndices: [{ type: Number }],
          itemSkus: [{ type: String }],
        },
      ],
    },

    // Credit and payment
    paymentMethod: {
      type: String,
      enum: ["credits", "cash", "bank_transfer"],
      default: "credits",
    },
    paymentReference: String,
    ncrReference: String,
    creditDeductedFrom: {
      type: Schema.Types.ObjectId,
      ref: "Credit",
    },
    creditTransactionId: String,

    routing: {
      vendorAssignments: { type: Map, of: [Schema.Types.ObjectId] },
      routedAt: Date,
    },
    dropshipStatus: {
      isDropship: { type: Boolean, default: false },
      vendorId: { type: Schema.Types.ObjectId, ref: "Vendor" },
      trackingNumber: String,
      shippedAt: Date,
    },
    approvalId: {
      type: Schema.Types.ObjectId,
      ref: "OrderApproval",
    },

    // Override fields
    overrideRequestId: {
      type: Schema.Types.ObjectId,
      ref: "OverrideRequest",
    },
    isOverrideOrder: {
      type: Boolean,
      default: false,
      index: true,
    },
    overrideType: {
      type: String,
      enum: ["USE_EXTRA_UNITS", "PAY_YOURSELF"],
    },
    shippingMethod: { type: String, trim: true },
    departmentInfo: { type: String, trim: true },
  },
  { timestamps: true },
);

OrderSchema.index({ userId: 1, status: 1 });
OrderSchema.index({ pageId: 1, status: 1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ "orderedBy.userId": 1, createdAt: -1 });
OrderSchema.index({ "orderedFor.userId": 1, createdAt: -1 });
OrderSchema.index({ approvalId: 1 });

export default mongoose.model<IOrder>("Order", OrderSchema);
