import mongoose, { Schema, Document } from "mongoose";

export interface IReservation extends Document {
  orderId: String;
  variantId: mongoose.Types.ObjectId;
  inventoryId?: mongoose.Types.ObjectId;
  qty: number;
  expiresAt: Date;
  status: "active" | "released" | "expired";
  releasedBy?: string;
  releasedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ReservationSchema = new Schema(
  {
    orderId: {
      type: String,
      required: true,
      index: true,
    },
    variantId: {
      type: Schema.Types.ObjectId,
      ref: "Variant",
      required: true,
    },
    inventoryId: {
      type: Schema.Types.ObjectId,
      ref: "Inventory",
    },
    qty: {
      type: Number,
      required: true,
      min: 1,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "released", "expired"],
      default: "active",
      index: true,
    },
    releasedBy: {
      type: String,
      default: null,
    },
    releasedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// TTL index: automatically delete expired reservations after 1 hour
ReservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 3600 });

// Compound index for active reservations
ReservationSchema.index({ status: 1, expiresAt: 1 });

// Pre-save hook: auto-set releasedAt when status changes to released
ReservationSchema.pre<IReservation>("save", function (next) {
  if (
    this.isModified("status") &&
    this.status === "released" &&
    !this.releasedAt
  ) {
    this.releasedAt = new Date();
  }
  next();
});

export default mongoose.model<IReservation>("Reservation", ReservationSchema);
