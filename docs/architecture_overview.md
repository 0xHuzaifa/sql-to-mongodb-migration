# Part 01: Architecture Overview & Migration Project Structure

## 1. Why a Custom Migration Engine + Control Dashboard?
Migrating a 50GB CounterPoint database into 75 strict Mongoose schemas requires iterative dry runs, visual verification of edge cases (such as misspelled grid tags and negative inventory), and resumable batch checkpoints. 

We will structure the migration tool as a dedicated sub-module inside your existing repository (so it can directly import `server/src/models/*` as the single source of truth) paired with a lightweight React Control Panel.

---

## 2. Project Directory Structure

```text
server/
├── src/
│   ├── models/                          # Existing 75 Mongoose models (Source of Truth)
│   │   ├── CounterPointMigration.model.ts
│   │   ├── MigrationKeyLedger.model.ts  # NEW: Source-to-Target ID Ledger
│   │   └── MigrationCheckpoint.model.ts # NEW: Resumable cursor state for 50GB tables
│   └── migration/                       # NEW: Dedicated CounterPoint ETL Engine
│       ├── config/
│       │   ├── mssql.client.ts          # SQL Server connection pool (tedious/mssql)
│       │   └── dimensionMap.config.ts   # Normalization dictionary for GRID_DIM tags
│       ├── cache/
│       │   └── idLedgerCache.ts         # In-memory Map<string, ObjectId> + MongoDB Ledger
│       ├── extractors/                  # SQL Stream & Keyset Pagination Readers
│       │   ├── reference.extractor.ts   # IM_LOC, IM_CATEG_COD, PO_VEND
│       │   ├── catalog.extractor.ts     # IM_ITEM, IM_SKU, IM_GRID_DIM_1..3, IM_BARCOD, IM_PRC
│       │   ├── inventory.extractor.ts   # IM_INV, IM_INV_CELL
│       │   ├── customer.extractor.ts    # AR_CUST, SY_GFC, SY_GFC_ACTIV
│       │   └── sales.extractor.ts       # PS_TKT_HIST + Lines + Payments (Keyset Paged)
│       ├── transformers/                # Pure functions: SQL Row -> Mongoose Document
│       │   ├── location.transformer.ts
│       │   ├── taxonomy.transformer.ts
│       │   ├── vendor.transformer.ts
│       │   ├── productVariant.transformer.ts
│       │   ├── inventory.transformer.ts
│       │   ├── customer.transformer.ts
│       │   └── posOrder.transformer.ts
│       ├── loaders/
│       │   └── bulkLoader.service.ts    # Batch validate() + bulkWrite() + Dead-Letter logger
│       ├── orchestrator/
│       │   └── migrationRunner.ts       # Enforces strict dependency phase order
│       └── routes/
│           └── migration.routes.ts      # REST + SSE endpoints for the Frontend UI
```

---

## 3. Dual Database Connection Architecture (`mssql.client.ts`)

Because the SQL Server database is 50GB, standard queries will time out if `requestTimeout` is left at the 15-second default. Configure `mssql` with streaming support and an extended timeout:

```typescript
// server/src/migration/config/mssql.client.ts
import sql from 'mssql';

const sqlConfig: sql.config = {
  user: process.env.CP_SQL_USER || 'cp_migration_reader',
  password: process.env.CP_SQL_PASSWORD!,
  database: process.env.CP_SQL_DATABASE || 'CounterPoint_Staging',
  server: process.env.CP_SQL_HOST || 'localhost',
  port: Number(process.env.CP_SQL_PORT) || 1433,
  pool: {
    max: 10,
    min: 2,
    idleTimeoutMillis: 60000,
  },
  options: {
    encrypt: false, // Set true if over WAN/Azure, false for local staging LAN
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  connectionTimeout: 30000,
  requestTimeout: 300000, // 5 minutes per paged query
};

let pool: sql.ConnectionPool | null = null;

export async function getSqlPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) return pool;
  pool = await new sql.ConnectionPool(sqlConfig).connect();
  return pool;
}
```

---

## 4. Reference Type Safety Matrix (`String` vs `ObjectId`)

One of the most important architectural details in `SYSTEM_COLLECTIONS_SCHEMA.md` is that **your Mongoose models mix `String` business keys and `ObjectId` references across collections**. Your transformers must obey this exact type matrix:

| Target Model.Field | Declared Mongoose Type | What Value Must Be Stored? |
| :--- | :--- | :--- |
| `Vendor.vendorId` | `String (unique)` | Raw CounterPoint `PO_VEND.VEND_NO` (e.g., `"VEND-101"`), **NOT** an `ObjectId`. |
| `Product.vendorId` | `String (ref: "Vendor")` | Raw CounterPoint `VEND_NO` string matching `Vendor.vendorId` (fallback `"INHOUSE"`). |
| `Variant.vendorId` | `String (ref: "Vendor")` | Raw CounterPoint `VEND_NO` string matching `Vendor.vendorId`. |
| `Inventory.vendorId` | `String (ref: "Vendor")` | Raw CounterPoint `VEND_NO` string matching `Vendor.vendorId`. |
| `Cashier.vendorId` | `ObjectId (ref: "Vendor")` | MongoDB `Vendor._id` (`ObjectId`)! |
| `PO.vendorId` | `ObjectId (ref: "Vendor")` | MongoDB `Vendor._id` (`ObjectId`)! |
| `Order.items[].vendorId` | `ObjectId (ref: "Vendor")` | MongoDB `Vendor._id` (`ObjectId`)! |
| `Product.category` | `String (ref: "Taxonomy")` | String category name matching `Taxonomy.category`! |
| `CategoryLimit.categoryId` | `ObjectId (ref: "Taxonomy")` | MongoDB `Taxonomy._id` (`ObjectId`)! |
| `Variant.productId` | `ObjectId (ref: "Product")` | MongoDB `Product._id` (`ObjectId`)! |
| `Inventory.productId` | `ObjectId (ref: "Product")` | MongoDB `Product._id` (`ObjectId`)! |
| `Inventory.variantId` | `ObjectId (ref: "Variant")` | MongoDB `Variant._id` (`ObjectId`)! |
| `InventoryLocation.inventoryId` | `ObjectId (ref: "Inventory")` | MongoDB `Inventory._id` (`ObjectId`)! |
| `InventoryLocation.warehouseId` | `String` | Raw `Location.warehouseId` string (e.g., `"MAIN"`, `"WAREHOUSE"`), **NOT** `ObjectId`! |

---

## 5. Control Panel Frontend Views (React / Next.js)

Build 4 focused views in the migration UI connected to `migration.routes.ts`:
1. **Pre-Flight Check & Connection Tester:** Verifies connectivity to both SQL Server (`CounterPoint_Staging`) and MongoDB, displaying row counts per source table vs. current target collection counts.
2. **Dry-Run Previewer (5-Row Inspector):** Selects any phase (e.g., `Phase 3.2: Variants`), pulls 5 real rows from SQL Server, runs the transformer + `doc.validate()` in memory without saving to MongoDB, and displays the side-by-side SQL input vs. Mongoose output JSON.
3. **Sequential Phase Runner:** Displays Phases 2.1 through 4.5 with live Server-Sent Events (SSE) progress bars, rows/sec throughput, and pause/resume controls.
4. **Dead-Letter & Anomaly Inspector:** Queries the `CounterPointMigration` collection (`counterpointmigrations`) to display any skipped or failed records (e.g., anomalous grid tags or negative stock adjustments) for one-click review.