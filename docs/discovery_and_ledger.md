# Part 02: Phase 1 - Data Discovery, Key Ledger & Checkpoint Models

## 1. Why a Dedicated Key Ledger is Mandatory
Rule #1 and Rule #6 of `SYSTEM_COLLECTIONS_SCHEMA.md` state:
* *Preserve original identifiers as strings, including leading zeros, case, meaningful spaces, and full composite-key components.*
* *Do not invent a `source` field on a strict schema; select a declared metadata location or use a separate migration ledger.*

Because Mongoose schemas strip undeclared fields (`strict: true`), we cannot attach a `legacySqlId` field directly onto `Product`, `User`, or `Taxonomy` documents. Instead, we create a persistent **`MigrationKeyLedger`** collection in MongoDB paired with a high-speed in-memory `Map` cache.

---

## 2. The `MigrationKeyLedger` & `MigrationCheckpoint` Models

Create these two supporting models in `server/src/models/`:

```typescript
// server/src/models/MigrationKeyLedger.model.ts
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
  sqlKey: string;                        // Exact SQL string key or composite key
  targetModel: string;                   // e.g., 'Product', 'Variant', 'User'
  targetObjectId: mongoose.Types.ObjectId; // The MongoDB _id
  targetBusinessKey?: string;            // e.g., masterSku or vendorId string
  batchId: string;
  createdAt: Date;
}

const MigrationKeyLedgerSchema = new Schema<IMigrationKeyLedger>(
  {
    domain: { type: String, required: true, index: true },
    sqlKey: { type: String, required: true }, // DO NOT trim or lowercase! Preserve exact SQL key
    targetModel: { type: String, required: true },
    targetObjectId: { type: Schema.Types.ObjectId, required: true },
    targetBusinessKey: { type: String, default: null },
    batchId: { type: String, required: true, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'migration_key_ledgers' }
);

// Guarantees idempotency: running the migration twice maps to the exact same MongoDB _id
MigrationKeyLedgerSchema.index({ domain: 1, sqlKey: 1 }, { unique: true });

export const MigrationKeyLedger = mongoose.model<IMigrationKeyLedger>(
  'MigrationKeyLedger',
  MigrationKeyLedgerSchema
);
```

### Resumable Checkpoints for 50GB Tables (`MigrationCheckpoint.model.ts`)
If a 1.4-million-row sales history migration is interrupted at row 850,000, you must be able to resume from row 850,001 without restarting from zero:

```typescript
// server/src/models/MigrationCheckpoint.model.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IMigrationCheckpoint extends Document {
  phaseKey: string;          // e.g., 'PHASE_4_3_POS_TKT_HIST'
  lastBusDat: Date | null;   // For keyset pagination on PS_TKT_HIST.BUS_DAT
  lastDocId: string | null;  // For keyset pagination on PS_TKT_HIST.DOC_ID / ITEM_NO
  processedRows: number;
  status: 'idle' | 'running' | 'paused' | 'completed' | 'failed';
  updatedAt: Date;
}

const MigrationCheckpointSchema = new Schema<IMigrationCheckpoint>(
  {
    phaseKey: { type: String, required: true, unique: true },
    lastBusDat: { type: Date, default: null },
    lastDocId: { type: String, default: null },
    processedRows: { type: Number, default: 0 },
    status: { type: String, enum: ['idle', 'running', 'paused', 'completed', 'failed'], default: 'idle' },
  },
  { timestamps: true, collection: 'migration_checkpoints' }
);

export const MigrationCheckpoint = mongoose.model<IMigrationCheckpoint>(
  'MigrationCheckpoint',
  MigrationCheckpointSchema
);
```

---

## 3. Canonical Composite Key Formatting Rules
To avoid key collisions across multi-column CounterPoint tables, format `sqlKey` in `MigrationKeyLedger` using pipe (`|`) delimiters while preserving exact case and leading zeros:

| CounterPoint Entity | Canonical `sqlKey` Format | Example `sqlKey` |
| :--- | :--- | :--- |
| **Location (`IM_LOC`)** | `${LOC_ID}` | `"MAIN"` |
| **Category (`IM_CATEG_COD`)** | `${CATEG_COD}` | `"APPAREL"` |
| **Vendor (`PO_VEND`)** | `${VEND_NO}` | `"00145"` |
| **Product (`IM_ITEM`)** | `${ITEM_NO}` | `"008921"` |
| **Non-Gridded Variant** | `${ITEM_NO}|*|*|*` | `"008921|*|*|*"` |
| **Gridded Variant (`IM_INV_CELL` / `IM_SKU`)** | `${ITEM_NO}|${DIM_1_UPR}|${DIM_2_UPR}|${DIM_3_UPR}` | `"008921|NAVY|XL|REG"` |
| **Customer (`AR_CUST`)** | `${CUST_NO}` | `"10005"` |
| **POS Ticket (`PS_TKT_HIST`)** | `${BUS_DAT_ISO}|${DOC_ID}|${TKT_NO}` | `"2025-11-14|10492831|01-094821"` |

---

## 4. High-Speed In-Memory Cache Service (`idLedgerCache.ts`)
Querying MongoDB for every foreign key across 1.4 million sales lines would require 3+ million network roundtrips. Instead, load the ledger into RAM at the start of each phase:
* **Memory Footprint Calculation:** 
  * `6,122` Products + `43,342` Variants + `71,038` Customers + `215` Vendors = **`120,717` total keys**.
  * Storing `120,717` key-value pairs in a Node.js `Map<string, Types.ObjectId>` consumes **less than 25 MB of RAM** and provides $O(1)$ nanosecond lookups!

```typescript
// server/src/migration/cache/idLedgerCache.ts
import mongoose from 'mongoose';
import { MigrationKeyLedger } from '../../models/MigrationKeyLedger.model';

class IdLedgerCache {
  private cache = new Map<string, { objectId: mongoose.Types.ObjectId; businessKey?: string }>();

  private makeKey(domain: string, sqlKey: string): string {
    return `${domain}::${sqlKey}`;
  }

  async warmUpDomains(domains: string[]): Promise<void> {
    const cursor = MigrationKeyLedger.find({ domain: { $in: domains } }).lean().cursor();
    for await (const doc of cursor) {
      this.cache.set(this.makeKey(doc.domain, doc.sqlKey), {
        objectId: doc.targetObjectId,
        businessKey: doc.targetBusinessKey,
      });
    }
    console.log(`[IdLedgerCache] Warmed up ${this.cache.size} keys for domains: ${domains.join(', ')}`);
  }

  getObjectId(domain: string, sqlKey: string): mongoose.Types.ObjectId | undefined {
    return this.cache.get(this.makeKey(domain, sqlKey))?.objectId;
  }

  getOrCreateObjectId(domain: string, sqlKey: string): {
    objectId: mongoose.Types.ObjectId;
    isNew: boolean;
  } {
    const composite = this.makeKey(domain, sqlKey);
    const existing = this.cache.get(composite);
    if (existing) {
      return { objectId: existing.objectId, isNew: false };
    }
    const newId = new mongoose.Types.ObjectId();
    this.cache.set(composite, { objectId: newId });
    return { objectId: newId, isNew: true };
  }
}

export const ledgerCache = new IdLedgerCache();
```