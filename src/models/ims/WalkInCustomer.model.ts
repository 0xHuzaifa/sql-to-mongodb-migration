import { Schema, model, Document } from "mongoose";

export interface IWalkInCustomer extends Document {
  firstName: string;
  lastName: string;
  email?: string;
  contact?: { phone: string; type: string }[];
  source?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    zip: string;
  };
  discountPercent?: number;
  isTaxExempt?: boolean;
  taxId?: string;
  taxExemptNumber?: string;
  taxExemptCategory?: string;
  isCompany?: boolean;
  companies?: {
    companyName: string;
    allotmentType: "unit" | "money";
    totalAllotment?: number;
    usedAllotment?: number;
    allotmentValue?: number;
    isUnlimited: boolean;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const WalkInCustomerSchema = new Schema<IWalkInCustomer>(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, default: "" },
    email: { type: String, default: "" },
    contact: [
      {
        phone: { type: String },
        type: { type: String }, // Mobile, Home, Work, etc.
      },
    ],
    source: { type: String, default: "pos" },
    address: {
      street: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      zip: { type: String, default: "" },
    },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    isTaxExempt: { type: Boolean, default: false },
    taxId: { type: String, default: "" },
    taxExemptNumber: { type: String, default: "" },
    taxExemptCategory: {
      type: String,
      default: "none",
    },
    isCompany: { type: Boolean, default: false },
    companies: [
      {
        companyName: { type: String, required: true },
        allotmentType: { type: String, enum: ["unit", "money"], required: true },
        totalAllotment: { type: Number, default: 0 },
        usedAllotment: { type: Number, default: 0 },
        allotmentValue: { type: Number, default: 0 },
        isUnlimited: { type: Boolean, default: false },
      },
    ],
  },
  {
    timestamps: true,
  }
);

WalkInCustomerSchema.pre<IWalkInCustomer>("save", function (next) {
  if (this.isModified("firstName") && this.firstName) {
    this.firstName = this.firstName.charAt(0).toUpperCase() + this.firstName.slice(1);
  }
  if (this.isModified("lastName") && this.lastName) {
    this.lastName = this.lastName.charAt(0).toUpperCase() + this.lastName.slice(1);
  }
  next();
});

export default model<IWalkInCustomer>("WalkInCustomer", WalkInCustomerSchema);
