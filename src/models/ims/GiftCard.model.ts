import mongoose, { Schema, Document } from "mongoose";

export interface IGiftCardTransaction {
  type: "issue" | "redemption" | "reload" | "void";
  amount: number;
  balanceAfter: number;
  referenceId?: string;
  cashierName?: string;
  paymentMethod?: string;
  notes?: string;
  createdAt: Date;
}

export interface IGiftCard extends Document {
  barcode: string;
  initialBalance: number;
  currentBalance: number;
  isActive: boolean;
  transactions: IGiftCardTransaction[];
  createdAt: Date;
  updatedAt: Date;
}

const GiftCardTransactionSchema = new Schema<IGiftCardTransaction>({
  type: {
    type: String,
    enum: ["issue", "redemption", "reload", "void"],
    required: true,
  },
  amount: { type: Number, required: true },
  balanceAfter: { type: Number, required: true },
  referenceId: { type: String },
  cashierName: { type: String },
  paymentMethod: { type: String },
  notes: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const GiftCardSchema = new Schema<IGiftCard>(
  {
    barcode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    initialBalance: { type: Number, required: true, default: 0 },
    currentBalance: { type: Number, required: true, default: 0 },
    isActive: { type: Boolean, default: true },
    transactions: [GiftCardTransactionSchema],
  },
  { timestamps: true }
);

export const GiftCard = mongoose.model<IGiftCard>("GiftCard", GiftCardSchema);
export default GiftCard;
