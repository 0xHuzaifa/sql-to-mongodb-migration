import mongoose, { Schema, Document } from "mongoose";

export interface ICustomColor extends Document {
  name: string;
  hex: string;
  createdAt: Date;
  updatedAt: Date;
}

const CustomColorSchema = new Schema<ICustomColor>(
  {
    name: { type: String, required: true, unique: true, trim: true, set: (val: string) => val.toLowerCase() },
    hex: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

export const CustomColor = mongoose.model<ICustomColor>("CustomColor", CustomColorSchema);
