# 50GB NCR CounterPoint to MongoDB IMS: Migration Engine & Control Dashboard

This project is a high-throughput, fault-tolerant, idempotent **Extract, Transform, Load (ETL) Migration Engine** paired with a real-time **Migration Control Dashboard** designed to migrate a **50GB NCR CounterPoint SQL Server database** into target **MongoDB IMS (75 Mongoose models)** and **Electron POS (NeDB)**.

---

## 1. Key Architectural Guarantees

1. **50GB Dataset Optimization:** Actively ignores over 30GB (~6.7M rows) of internal CounterPoint General Ledger distributions (`SY_DIST`), transaction logs (`PS_TRX_LOG`), and audit trails, reducing the active working set from 50GB to ~18GB.
2. **Keyset Streaming Pagination:** Uses `WHERE DOC_ID > @lastDocId ORDER BY DOC_ID ASC` index seeks (< 15ms) rather than slow `OFFSET / FETCH`.
3. **Mongoose In-Memory Validation Gate:** Each batch item runs `doc.validateSync()` in memory to enforce schema types, enum constraints, and hooks (e.g. `Inventory` pre-validate `qtyAvailable` calculation) before queuing to `bulkWrite()`.
4. **Dead-Letter Isolation:** Batch errors never crash the pipeline. Failed records or negative stock clamps are captured and persisted into `CounterPointMigration` for one-click audit review.
5. **In-Memory Key Ledger Cache:** Maps 120,000+ source-to-target keys in a <25MB RAM `Map` for nanosecond foreign key lookups without network latency.
6. **42-Tag Dynamic Grid Normalizer:** Resolves reversed slots (`SIZE | COLOR`), typos (`Sisez`, `SOZE`, `HIEGHT`), uniform dimensions (`Hand`, `Neck`, `Sleeve`, `Finish`), and inline tags.
7. **Strict PCI Exclusion:** Excludes `PS_TKT_HIST_PMT_CR_CARD` and strips credit card numbers, track data, CVVs, and auth codes. Only safe tender summaries are imported.

---

## 2. Directory Structure

```text
sql-to-mongodb/
├── src/
│   ├── config/
│   │   ├── env.config.ts             # Validated environment configuration
│   │   ├── mssql.client.ts           # SQL Server pool with 5-minute timeout
│   │   ├── mongo.client.ts           # Mongoose connection setup
│   │   └── dimensionMap.config.ts    # 42-tag dynamic grid normalizer
│   ├── models/
│   │   ├── MigrationKeyLedger.model.ts   # Persistent source-to-target ID ledger
│   │   ├── MigrationCheckpoint.model.ts  # Resumable keyset checkpoint
│   │   └── ims/                          # Target Mongoose models (Product, Variant, Inventory, etc.)
│   ├── cache/
│   │   └── idLedgerCache.ts          # In-memory Map<string, ObjectId> (<25MB RAM)
│   ├── extractors/
│   │   ├── reference.extractor.ts    # Locations, categories, vendors
│   │   ├── catalog.extractor.ts      # Items, grid cells, barcodes, prices
│   │   ├── inventory.extractor.ts    # Stock headers & cell quantities
│   │   ├── customer.extractor.ts     # Customer hierarchy & gift cards
│   │   └── sales.extractor.ts        # Keyset paged historical tickets + lines
│   ├── transformers/                 # Pure mapping functions
│   ├── loaders/
│   │   └── bulkLoader.service.ts     # validateSync() + bulkWrite() + audit logging
│   ├── orchestrator/
│   │   ├── phaseRunner.ts            # Enforces strict phase dependency order
│   │   └── reconciliation.ts         # 8 automated SQL vs MongoDB verification checks
│   ├── routes/
│   │   └── migration.routes.ts       # REST & SSE endpoints
│   └── server.ts                     # Express application entrypoint
└── client/                           # React Migration Control Dashboard
    ├── src/
    │   ├── components/
    │   │   ├── PreFlightCheck.tsx        # Pre-flight volume matrix & DB tester
    │   │   ├── DryRunInspector.tsx       # 5-row live in-memory inspector
    │   │   ├── PhaseProgressRunner.tsx   # SSE live progress runner
    │   │   ├── DeadLetterInspector.tsx   # Anomaly & dead-letter viewer
    │   │   └── ReconciliationView.tsx    # 8-point cutover verification
    │   └── App.tsx
```

---

## 3. Quick Start

### Step 1: Configure Environment Variables
Copy `.env.example` to `.env` and fill in your SQL Server staging credentials and MongoDB URI:

```bash
# SQL Server (.bak Staging instance)
CP_SQL_HOST=localhost
CP_SQL_PORT=1433
CP_SQL_USER=cp_migration_reader
CP_SQL_PASSWORD=StrongMigrationPass!2026
CP_SQL_DATABASE=CounterPoint_Staging

# MongoDB Target Database
MONGO_URI=mongodb://localhost:27017/ims_staging_migration
```

### Step 2: Start the Backend Migration Engine
```bash
# Development mode with auto-reload
npm run dev

# High-memory execution mode for 50GB dataset
NODE_OPTIONS="--max-old-space-size=4096" npm run dev
```

### Step 3: Start the Control Dashboard UI
```bash
npm run client:dev
```
Open **`http://localhost:3000`** in your browser.

---

## 4. Migration Execution Workflow

1. **Pre-Flight Check:** Verify connectivity and review source table row counts vs target collection counts.
2. **Dry-Run Inspection:** Pick any phase and view a 5-row live sample with side-by-side SQL input and Mongoose output.
3. **Phase Execution:**
   - Run Phase 2.1: Locations & Facilities
   - Run Phase 2.2: Taxonomies
   - Run Phase 2.3: Vendors
   - Run Phase 3: Catalog, Variants & Inventory
   - Run Phase 4.1: Customers
   - Run Phase 4.2: Gift Cards
   - Run Phase 4.3: Historical Tickets
4. **Dead-Letter Review:** Inspect any negative stock adjustments or schema collisions.
5. **Cutover Verification:** Run the 8-point automated reconciliation suite comparing exact sums and counts.
