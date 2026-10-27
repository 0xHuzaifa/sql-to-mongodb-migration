import mongoose, { Schema, Document } from "mongoose";

export type SaleRuleStatus = "scheduled" | "active" | "expired" | "disabled";
export type SaleRuleTargetType = "CATEGORY" | "SUBCATEGORY" | "PRODUCT" | "CARD_NETWORK" | "ALL";
export type SaleRuleDiscountType = "PERCENT" | "FIXED_PRICE" | "FIXED_OFF";
export type CardNetwork = "MASTERCARD" | "VISA" | "AMEX" | "DISCOVER";

export interface ISaleRule extends Document {
  name: string;
  description?: string;
  status: SaleRuleStatus;

  targetType: SaleRuleTargetType;
  targetCategories?: string[];
  targetProductIds?: mongoose.Types.ObjectId[];
  cardNetwork?: CardNetwork;

  discountType: SaleRuleDiscountType;
  discountValue: number;

  startDateTime: Date;
  endDateTime: Date;

  priority: number;
  stackWithContractPrice: boolean;
  createdBy?: mongoose.Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

const SaleRuleSchema = new Schema<ISaleRule>(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    status: {
      type: String,
      enum: ["scheduled", "active", "expired", "disabled"],
      default: "scheduled",
      index: true,
    },
    targetType: {
      type: String,
      enum: ["CATEGORY", "SUBCATEGORY", "PRODUCT", "CARD_NETWORK", "ALL"],
      required: true,
      index: true,
    },
    targetCategories: [{ type: String, trim: true }],
    targetProductIds: [{ type: Schema.Types.ObjectId, ref: "Product" }],
    cardNetwork: {
      type: String,
      enum: ["MASTERCARD", "VISA", "AMEX", "DISCOVER"],
      default: null,
    },
    discountType: {
      type: String,
      enum: ["PERCENT", "FIXED_PRICE", "FIXED_OFF"],
      required: true,
    },
    discountValue: { type: Number, required: true, min: 0 },
    startDateTime: { type: Date, required: true, index: true },
    endDateTime: { type: Date, required: true, index: true },
    priority: { type: Number, default: 1 },
    stackWithContractPrice: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

SaleRuleSchema.index({ status: 1, startDateTime: 1, endDateTime: 1 });
SaleRuleSchema.index({ targetType: 1, status: 1 });

export default mongoose.model<ISaleRule>("SaleRule", SaleRuleSchema);
