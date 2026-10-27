import { Schema, model, Document, Types } from "mongoose";

export interface ICustomerMeasurement extends Document {
  ownerId: Types.ObjectId;
  ownerModel: "User" | "WalkInCustomer";
  footwear?: {
    system?: string; // e.g. "US", "UK", "EU"
    value?: string; // e.g. "9", "42"
  };
  apparel?: {
    shirtSize?: string;
    pantWaist?: number;
    pantLength?: number;
  };
  customFields?: Map<string, string>;
  createdAt: Date;
  updatedAt: Date;
}

const CustomerMeasurementSchema = new Schema<ICustomerMeasurement>(
  {
    ownerId: { type: Schema.Types.ObjectId, required: true, refPath: "ownerModel" },
    ownerModel: { type: String, required: true, enum: ["User", "WalkInCustomer"] },
    footwear: {
      system: { type: String },
      value: { type: String },
    },
    apparel: {
      shirtSize: { type: String },
      pantWaist: { type: Number },
      pantLength: { type: Number },
    },
    customFields: {
      type: Map,
      of: String,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

export default model<ICustomerMeasurement>("CustomerMeasurement", CustomerMeasurementSchema);
