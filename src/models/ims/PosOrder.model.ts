import mongoose, { Schema, Document } from "mongoose";

export interface IPosOrderItem {
  productId: mongoose.Types.ObjectId;
  variantId: mongoose.Types.ObjectId;
  sku: string;
  productName: string;
  variantName?: string;
  color?: any;
  size?: string;
  length?: string;
  attributes?: any[];
  categoryId?: mongoose.Types.ObjectId;
  subcategoryName?: string;
  qty: number;
  price: number;
  originalPrice?: number;
  contractPrice?: number;
  discountAmount?: number;
  discountPercent?: number;
  discountedPrice?: number;
  unitsUsed: number;
  isAllotmentCovered?: boolean;
  allotmentType?: string;
  customPrice?: number;
  isTaxExempt?: boolean;
  taxRate?: number;
  mandatoryAlterations?: any[];
  alterationInputs?: Record<string, any>;
  alterations?: any[];
  isRestrictedItem?: boolean;
  officerIdNumber?: string;
  idVerifiedBy?: string;
  idVerifiedAt?: Date;
  itemType?: "regular_sale" | "order" | "layaway" | "backorder" | "hold" | "alteration_required";
  itemStatus?: "ordered" | "backordered" | "received" | "in_alteration" | "hold_section" | "ready_for_pickup" | "picked_up" | "cancelled";
  garmentStage?: "pending" | "embroidery" | "tailoring" | "hold_section" | "picked_up" | "cancelled";
  fulfillment?: {
    fulfilledQty: number;
    pendingQty: number;
    fulfilledAt?: Date;
    pickedUpBy?: string;
  };
  rackLocation?: string;
  locationId?: string;
  locationName?: string;
  stagedAt?: Date;
  holdSectionAt?: Date;
  itemNotes?: string;
  layawayDetails?: {
    depositAmount: number;
    balanceRemaining: number;
    dueDate?: Date;
    minimumDepositPercent?: number;
  };
}

export interface IPosOrderPayment {
  method: string;
  amount: number;
  reference?: string;
  giftCardBarcode?: string;
}

export interface IPosOrder extends Document {
  localId: string;
  terminalId: string;
  cashierId?: mongoose.Types.ObjectId;
  cashierName: string;
  counterNo: string;
  counterName?: string;
  facilityId?: string;
  locationId?: string;
  locationName?: string;
  userId?: mongoose.Types.ObjectId;
  pageId?: mongoose.Types.ObjectId;
  groupId?: mongoose.Types.ObjectId;
  subtotal?: number;
  discountTotal?: number;
  taxTotal?: number;
  taxRate?: number;
  globalDiscountPercent?: number;
  globalDiscountAmount?: number;
  isTaxExempt?: boolean;
  totalAmount: number;
  totalUnitsUsed: number;
  paymentMethod: string;
  payments?: IPosOrderPayment[];
  allotmentCovered?: number;
  allotmentType?: string;
  isWalkInCompany?: boolean;
  walkInCompanyName?: string;
  customerId?: any;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  group?: any;
  receiptData: any;
  items: IPosOrderItem[];
  syncTimestamp: Date;
  status?: "completed" | "reopened" | "voided" | "pending" | "in_process" | "partially_fulfilled" | "ready_for_pickup" | "fulfilled" | "cancelled";
  poNumber?: string;
  stagedAt?: Date;
  holdSectionAt?: Date;
  isARTicket?: boolean;
  batchSettledAt?: Date;
  cardLast4?: string;
  cardAuthCode?: string;
  paymentProcessorTxnId?: string;
  ncrReference?: string;
  buyerProvided?: number;
  changeDue?: number;
  editHistory?: {
    editType: string;
    editedBy: string;
    editedAt?: Date;
    description: string;
    amountDelta?: number;
    allotmentDelta?: number;
    unitsRefunded?: number;
    paymentAction?: string;
    paymentActionStatus?: string;
    additionalPayments?: IPosOrderPayment[];
  }[];
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
}

const PosOrderItemSchema = new Schema<IPosOrderItem>({
  productId: { type: Schema.Types.Mixed },
  variantId: { type: Schema.Types.Mixed },
  sku: { type: String },
  productName: { type: String, default: "Unknown Product" },
  variantName: { type: String },
  color: { type: Schema.Types.Mixed },
  size: { type: String },
  length: { type: String },
  attributes: [Schema.Types.Mixed],
  categoryId: { type: Schema.Types.Mixed },
  subcategoryName: { type: String },
  qty: { type: Number, required: true },
  price: { type: Number, required: true },
  originalPrice: { type: Number },
  contractPrice: { type: Number },
  discountAmount: { type: Number },
  discountPercent: { type: Number },
  discountedPrice: { type: Number },
  customPrice: { type: Number },
  isTaxExempt: { type: Boolean },
  taxRate: { type: Number },
  unitsUsed: { type: Number, default: 0 },
  mandatoryAlterations: [Schema.Types.Mixed],
  alterationInputs: { type: Schema.Types.Mixed },
  alterations: [Schema.Types.Mixed], // CartAlteration objects: { name, price, type, customInputs, ... }
  isRestrictedItem: { type: Boolean, default: false },
  officerIdNumber: { type: String, trim: true },
  idVerifiedBy: { type: String, trim: true },
  idVerifiedAt: { type: Date },
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
  itemNotes: { type: String, trim: true },
  layawayDetails: {
    depositAmount: { type: Number },
    balanceRemaining: { type: Number },
    dueDate: { type: Date },
    minimumDepositPercent: { type: Number, default: 20 },
  },
});

const PosOrderPaymentSchema = new Schema<IPosOrderPayment>({
  method: { type: String, required: true },
  amount: { type: Number, required: true },
  reference: { type: String },
  giftCardBarcode: { type: String },
});

const PosOrderSchema = new Schema<IPosOrder>(
  {
    localId: { type: String, required: true, unique: true },
    terminalId: { type: String, required: true },
    cashierId: { type: Schema.Types.ObjectId, ref: "Cashier" },
    cashierName: { type: String, required: true },
    counterNo: { type: String, required: true },
    counterName: { type: String },
    facilityId: { type: String, index: true },
    locationId: { type: String, index: true },
    locationName: { type: String },
    userId: { type: Schema.Types.ObjectId, ref: "User" },
    pageId: { type: Schema.Types.ObjectId, ref: "Page" },
    groupId: { type: Schema.Types.ObjectId, ref: "EmployeeGroup" },
    subtotal: { type: Number },
    discountTotal: { type: Number },
    taxTotal: { type: Number },
    taxRate: { type: Number },
    globalDiscountPercent: { type: Number },
    globalDiscountAmount: { type: Number },
    isTaxExempt: { type: Boolean, default: false },
    totalAmount: { type: Number, required: true },
    totalUnitsUsed: { type: Number, default: 0 },
    allotmentCovered: { type: Number, default: 0 },
    allotmentType: { type: String },
    paymentMethod: { type: String, required: true },
    payments: [PosOrderPaymentSchema],
    status: {
      type: String,
      enum: ["completed", "reopened", "voided", "pending", "in_process", "partially_fulfilled", "ready_for_pickup", "fulfilled", "cancelled"],
      default: "completed",
    },
    poNumber: { type: String, trim: true },
    isARTicket: { type: Boolean, default: false },
    batchSettledAt: { type: Date },
    cardLast4: { type: String },
    cardAuthCode: { type: String },
    paymentProcessorTxnId: { type: String },
    ncrReference: { type: String },
    buyerProvided: { type: Number },
    changeDue: { type: Number },
    editHistory: [
      {
        editType: { type: String, required: true },
        editedBy: { type: String, required: true },
        editedAt: { type: Date, default: Date.now },
        description: { type: String, required: true },
        amountDelta: { type: Number, default: 0 },
        allotmentDelta: { type: Number, default: 0 },
        unitsRefunded: { type: Number, default: 0 },
        paymentAction: { type: String },
        paymentActionStatus: { type: String },
        additionalPayments: [PosOrderPaymentSchema],
      },
    ],
    isWalkInCompany: { type: Boolean, default: false },
    walkInCompanyName: { type: String },
    receiptData: { type: Schema.Types.Mixed },
    items: [PosOrderItemSchema],
    syncTimestamp: { type: Date, default: Date.now },
    stagedAt: { type: Date },
    holdSectionAt: { type: Date },
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
  },
  { timestamps: true }
);

export default mongoose.model<IPosOrder>("PosOrder", PosOrderSchema);
