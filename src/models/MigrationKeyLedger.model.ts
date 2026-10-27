import mongoose, { Schema, Document } from 'mongoose';

export interface IMigrationKeyLedger extends Document {
  domain:
    | 'IM_LOC_FACILITY'
    | 'IM_LOC_LOCATION'
    | 'IM_CATEG_COD'
    | 'PO_VEND'
    | 'IM_ITEM'
    | 'IM_VARIANT_CELL'
    | 'IM_INV'
    | 'AR_CUST_PAGE'
    | 'AR_CUST_GROUP'
    | 'AR_CUST_USER'
    | 'AR_CUST_WALKIN'
    | 'SY_GFC'
    | 'PS_TKT_HIST';
  sqlKey: string;                          // Exact SQL string key or canonical composite key
  targetModel: string;                     // e.g., 'Product', 'Variant', 'User'
  targetObjectId: mongoose.Types.ObjectId; // The MongoDB _id
  targetBusinessKey?: string;              // e.g., masterSku or vendorId string
  batchId: string;
  createdAt: Date;
}

const MigrationKeyLedgerSchema = new Schema<IMigrationKeyLedger>(
  {
    domain: { type: String, required: true, index: true },
    sqlKey: { type: String, required: true }, // Preserves exact casing, leading zeros, and spaces
    targetModel: { type: String, required: true },
    targetObjectId: { type: Schema.Types.ObjectId, required: true },
    targetBusinessKey: { type: String, default: null },
    batchId: { type: String, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'migration_key_ledgers' }
);

// Compound unique index guarantees 100% idempotency across re-runs
MigrationKeyLedgerSchema.index({ domain: 1, sqlKey: 1 }, { unique: true });

export const MigrationKeyLedger = mongoose.model<IMigrationKeyLedger>(
  'MigrationKeyLedger',
  MigrationKeyLedgerSchema
);
export default MigrationKeyLedger;
