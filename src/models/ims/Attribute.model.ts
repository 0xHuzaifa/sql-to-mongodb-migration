// src/models/Attribute.model.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IAttribute extends Document {
  name: string;
  values: string[];
  attributeType: "text" | "number" | "boolean" | "select";
  isRequired: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AttributeSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
      lowercase: true,
    },
    values: [{ type: String, trim: true, lowercase: true }],
    attributeType: {
      type: String,
      enum: ["text", "number", "boolean", "select"],
      default: "select",
    },
    isRequired: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

AttributeSchema.pre<IAttribute>("save", function (next) {
  if (this.name) this.name = this.name.trim().toLowerCase();
  next();
});

export default mongoose.model<IAttribute>("Attribute", AttributeSchema);
