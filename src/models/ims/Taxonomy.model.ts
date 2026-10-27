// src/models/Taxonomy.model.ts

import mongoose, { Schema, Document } from "mongoose";

export interface ITaxonomy extends Document {
  category: string;
  subcategories: { name: string; description?: string }[];
  parentCategory?: mongoose.Types.ObjectId;
  level: number;
  /** Product IDs that use this category (for inhouse products) */
  productIds?: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const TaxonomySchema = new Schema(
  {
    category: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    subcategories: [
      {
        name: {
          type: String,
          required: true,
        },
        description: String,
        default: {},
      },
    ],
    parentCategory: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Taxonomy",
      default: null,
    },
    level: {
      type: Number,
      default: 0, // 0 = root level
    },
    productIds: [
      { type: Schema.Types.ObjectId, ref: "Product", default: undefined },
    ],
  },
  { timestamps: true }
);

TaxonomySchema.index({ parentCategory: 1 });

TaxonomySchema.pre<ITaxonomy>("save", function (next) {
  if (this.category) this.category = this.category.trim();
  next();
});

export default mongoose.model<ITaxonomy>("Taxonomy", TaxonomySchema);
