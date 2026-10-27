import mongoose, { Schema, Document } from "mongoose";

export interface IFacility extends Document {
  facilityId: string;
  name: string;
  code: string;
  type: "main" | "warehouse" | "retail_store" | "satellite" | "other";
  address?: {
    street?: string;
    city?: string;
    state?: string;
    country?: string;
    zipCode?: string;
  };
  contact?: {
    phone?: string;
    email?: string;
    managerName?: string;
  };
  isPrimary: boolean;
  isActive: boolean;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const FacilitySchema = new Schema(
  {
    facilityId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    type: {
      type: String,
      enum: ["main", "warehouse", "retail_store", "satellite", "other"],
      default: "main",
    },
    address: {
      street: { type: String, default: "" },
      city: { type: String, default: "" },
      state: { type: String, default: "" },
      country: { type: String, default: "" },
      zipCode: { type: String, default: "" },
    },
    contact: {
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      managerName: { type: String, default: "" },
    },
    isPrimary: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

FacilitySchema.index({ name: 1 });
FacilitySchema.index({ code: 1 });

export default mongoose.model<IFacility>("Facility", FacilitySchema);
