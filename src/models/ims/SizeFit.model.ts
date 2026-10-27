// src/models/SizeFit.model.ts
import mongoose, { Schema, Document } from "mongoose";

export interface ISizeFit extends Document {
  productId: mongoose.Types.ObjectId;
  // free-form JSON for size charts (e.g., {us: {...}, eu: {...}})
  chartData: Record<string, any>;
  // conversions or helper maps
  conversions?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const SizeFitSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      unique: true,
    },
    chartData: {
      type: Map,
      of: new mongoose.Schema(
        {
          chest: Number,
          waist: Number,
          length: Number,
          shoulder: Number,
          sleeve: Number,
        },
        { _id: false }
      ),
      default: {},
    },
    conversions: { type: Schema.Types.Mixed, default: {} },
    unit: {
      type: String,
      enum: ["inches", "cm"],
      default: "inches",
    },
    fitType: {
      type: String,
      enum: ["slim", "regular", "loose", "oversized"],
      default: "regular",
    },
  },
  { timestamps: true }
);

export default mongoose.model<ISizeFit>("SizeFit", SizeFitSchema);
