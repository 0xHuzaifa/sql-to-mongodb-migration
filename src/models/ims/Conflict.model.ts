import mongoose, { Schema, Document } from "mongoose";

export interface IConflict extends Document {
  inventoryId: mongoose.Types.ObjectId;
  type: "qtyMismatch" | "priceMismatch";
  details: {
    vendorQty?: number;
    systemQty?: number;
    vendorPrice?: number;
    systemPrice?: number;
    [key: string]: any;
  };
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ConflictSchema = new Schema(
  {
    inventoryId: {
      type: Schema.Types.ObjectId,
      ref: "Inventory",
      required: true,
    },
    type: {
      type: String,
      enum: ["qtyMismatch", "priceMismatch"],
      required: true,
      index: true,
    },
    details: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
    },
    resolved: {
      type: Boolean,
      default: false,
      index: true,
    },
    resolvedBy: {
      type: String,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Compound index for filtering unresolved conflicts
ConflictSchema.index({ resolved: 1, createdAt: -1 });

// Pre-save hook: auto-set resolvedAt when resolved
ConflictSchema.pre<IConflict>("save", function (next) {
  if (this.isModified("resolved") && this.resolved && !this.resolvedAt) {
    this.resolvedAt = new Date();
  }
  next();
});

export default mongoose.model<IConflict>("Conflict", ConflictSchema);
