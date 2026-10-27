import mongoose, { Schema, Document } from "mongoose";

export interface ISizeScale extends Document {
  name: string;
  sizes: Array<{ size: string; description?: string }>;
  colors?: Array<{ name: string; hex?: string }>;
  createdAt: Date;
  updatedAt: Date;
}

const SizeScaleSchema = new Schema<ISizeScale>(
  {
    name: { type: String, required: true, unique: true, trim: true },
    sizes: [
      {
        size: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        _id: false,
      },
    ],
    colors: [
      {
        name: { type: String, required: true, trim: true },
        hex: { type: String, trim: true },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

export const SizeScale = mongoose.model<ISizeScale>("SizeScale", SizeScaleSchema);
