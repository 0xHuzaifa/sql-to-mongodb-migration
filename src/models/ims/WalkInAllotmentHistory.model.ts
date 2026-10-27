import { Schema, model, Document, Types } from "mongoose";

export interface IWalkInAllotmentHistory extends Document {
  customerId: Types.ObjectId;
  companyName: string;
  actionType: "UPDATE" | "USAGE";
  amount: number; // The amount added, deducted, or used
  previousBalance: number;
  newBalance: number;
  allotmentType: "unit" | "money";
  orderId?: string; // Reference to PosOrder localId if action is USAGE
  items?: {
    productName: string;
    qty: number;
    price: number;
    unitsUsed: number;
  }[]; // Snapshot of items bought if action is USAGE
  adminId?: Types.ObjectId; // Reference to User if action is UPDATE
  adminName?: string; // Name of the admin for easy display
  createdAt: Date;
  updatedAt: Date;
}

const WalkInAllotmentHistorySchema = new Schema<IWalkInAllotmentHistory>(
  {
    customerId: { type: Schema.Types.ObjectId, ref: "WalkInCustomer", required: true },
    companyName: { type: String, required: true },
    actionType: { type: String, enum: ["UPDATE", "USAGE"], required: true },
    amount: { type: Number, required: true },
    previousBalance: { type: Number, required: true },
    newBalance: { type: Number, required: true },
    allotmentType: { type: String, enum: ["unit", "money"], required: true },
    orderId: { type: String },
    items: [
      {
        productName: { type: String },
        qty: { type: Number },
        price: { type: Number },
        unitsUsed: { type: Number },
      },
    ],
    adminId: { type: Schema.Types.ObjectId, ref: "User" },
    adminName: { type: String },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster querying
WalkInAllotmentHistorySchema.index({ customerId: 1, companyName: 1 });
WalkInAllotmentHistorySchema.index({ createdAt: -1 });

export default model<IWalkInAllotmentHistory>("WalkInAllotmentHistory", WalkInAllotmentHistorySchema);
