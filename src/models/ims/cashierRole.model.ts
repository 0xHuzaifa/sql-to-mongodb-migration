// src/models/cashierRole.model.ts
import mongoose, { Schema, Document } from "mongoose";
import { ICashierPrivileges, CashierPrivilegesSchema } from "./cashier.model";

export interface ICashierRole extends Document {
  vendorId: string;
  value: string;           // e.g. 'cashier', 'supervisor', 'manager'
  label: string;           // e.g. 'Cashier', 'Supervisor', 'Manager'
  description?: string;    // Short human-readable description
  canAuthorizeOverrides: boolean; // Whether this role can authorize manager overrides in POS
  isDefault?: boolean;     // If true, this is a system default role that cannot be deleted
  privileges: ICashierPrivileges; // Default privileges template for this role
  imsPermissions: string[]; // IMS module permissions for this role
  createdAt?: Date;
  updatedAt?: Date;
}

const CashierRoleSchema = new Schema<ICashierRole>(
  {
    vendorId: { type: String, required: true, index: true },
    value: { type: String, required: true, trim: true, lowercase: true },
    label: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    canAuthorizeOverrides: { type: Boolean, default: false },
    isDefault: { type: Boolean, default: false },
    privileges: {
      type: CashierPrivilegesSchema,
      default: () => ({}),
    },
    imsPermissions: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

// Ensure value is unique per vendor
CashierRoleSchema.index({ vendorId: 1, value: 1 }, { unique: true });

export const CashierRole = mongoose.model<ICashierRole>("CashierRole", CashierRoleSchema);
