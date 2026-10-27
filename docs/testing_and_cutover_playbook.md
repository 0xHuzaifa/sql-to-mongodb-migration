# Part 08: Reconciliation, POS Sync & Production Cutover Playbook

## 1. Automated SQL-to-MongoDB Reconciliation Checks
Never declare a migration complete based solely on "0 uncaught exceptions." Run a dedicated reconciliation script that compares exact source SQL counts and sums against target MongoDB collections:

| Check # | Domain | SQL Server Verification Query | MongoDB Verification Query | Pass Criteria |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Locations** | `SELECT COUNT(*) FROM dbo.IM_LOC` (`4`) | `db.locations.countDocuments()` | Exact match (`4`) |
| **2** | **Categories** | `SELECT COUNT(*) FROM dbo.IM_CATEG_COD` (`19`) | `db.taxonomies.countDocuments()` | `19` (+1 if `UNCATEGORIZED` used) |
| **3** | **Vendors** | `SELECT COUNT(*) FROM dbo.PO_VEND` (`215`) | `db.vendors.countDocuments()` | `215` (+1 for `INHOUSE` vendor) |
| **4** | **Products** | `SELECT COUNT(*) FROM dbo.IM_ITEM` (`6,122`) | `db.products.countDocuments()` | Exact match (`6,122`) |
| **5** | **Positive Stock Sum** | `SELECT SUM(QTY_ON_HND) FROM dbo.IM_INV WHERE QTY_ON_HND > 0` | `db.inventorylocations.aggregate([{ $group: { _id: null, total: { $sum: "$quantity" } } }])` | 100% match on positive stock units |
| **6** | **Gift Cards** | `SELECT COUNT(*), SUM(CURR_AMT) FROM dbo.SY_GFC WHERE IS_VOID = 'N'` | `db.giftcards.aggregate([{ $match: { isActive: true } }, { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$currentBalance" } } }])` | Exact count & dollar balance match |
| **7** | **Customers** | `SELECT COUNT(*) FROM dbo.AR_CUST` (`71,038`) | Sum of migrated `WalkInCustomer` + `User` + `Page` records in `MigrationKeyLedger` (`domain: /^AR_CUST/`) | 100% of `71,038` `CUST_NO` keys accounted for |
| **8** | **POS Tickets** | `SELECT COUNT(*), SUM(TOT) FROM dbo.PS_TKT_HIST` (`470,431`) | `db.posorders.aggregate([{ $match: { localId: /^CP-/ } }, { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: "$totalAmount" } } }])` | Exact ticket count & total revenue match |

---

## 2. Electron POS (NeDB) Synchronization Protocol (Rule #7)
As documented in `SYSTEM_COLLECTIONS_SCHEMA.md`, the POS terminals run Electron with local NeDB datastores (`products.db`, `customers.db`, `locations.db`, `facilities.db`, `sales.db`).
* **CRITICAL RULE:** **Never write directly into terminal `.db` files** or overwrite `syncQueue.db` / `held_carts.db` on POS terminals.
* Instead, follow the exact POS sync dependency order after MongoDB migration is verified:
  1. Ensure all POS terminals have flushed their `syncQueue.db` (zero pending offline sales).
  2. Complete MongoDB migration on the central server (`Facility`, `Location`, `Taxonomy`, `Vendor`, `Product`, `Variant`, `Inventory`, `InventoryLocation`, `WalkInCustomer`, `User`, `Page`).
  3. Trigger the POS catalog poll (`pos/electron/services/poll.service.ts` and `products.db.ts`) on a staging POS terminal first.
  4. Verify on the POS terminal that:
     * Scanning primary barcodes (`Variant.barcode`) and alternate barcodes (`Variant.additionalBarcodes`) resolves the exact variant.
     * Custom uniform dimensions (`Neck`, `Sleeve`, `Hand`, `Finish`) in `Variant.additionalAttributes` display properly in the POS item selector.
     * Searching walk-in customers and corporate portal officers resolves their `WalkInCustomer` / `User` profiles.

---

## 3. Three-Stage Dry-Run Execution Plan

### Stage 1: The 1% Smoke Dry-Run (Local / Dev DB)
* Run Phases 2.1, 2.2, and 2.3 in full (`Locations`, `Taxonomies`, `Vendors`).
* Run Phase 3 (`Products`, `Variants`, `Inventory`) limited to `TOP 100` items from `IM_ITEM` (50 non-gridded + 50 gridded items covering all 42 `GRID_DIM` tag combinations).
* Run Phase 4 (`Customers`, `PosOrder`) limited to `TOP 500` customers and `TOP 500` tickets.
* Inspect the `CounterPointMigration` collection and verify zero schema validation errors.

### Stage 2: Full 50GB Staging Dry-Run (Isolated Staging MongoDB Cluster)
* Execute the full migration against the restored 50GB `.bak` staging database into an isolated staging MongoDB database (`ims_staging_migration`).
* Record exact execution timings for each phase:
  * Phases 2 & 3 (Catalog & Inventory): ~3–5 minutes.
  * Phase 4.1 & 4.2 (71K Customers & Gift Cards): ~2–3 minutes.
  * Phase 4.3 (470K Historical Tickets + 1.4M Lines): ~10–15 minutes via keyset batching.
* Run the **8 Reconciliation Queries** (Section 1 above) and review all `warning` records in `CounterPointMigration`.

### Stage 3: Final Cutover Weekend Runbook (Production Go-Live)
1. **T-Minus 24 Hours (Pre-Stage Historical Data):**
   * Because historical sales (`PS_TKT_HIST` prior to cutover week) are immutable, you can migrate all historical tickets up to `BUS_DAT < Cutover_Date` ahead of time using idempotent upserts!
2. **T-Minus 0 (Cutover Window — Store Close):**
   * Close all NCR CounterPoint POS drawer sessions (`PS_DRW_SESSION`) and place CounterPoint in read-only/offline mode.
   * Take the final differential/full `.bak` backup from the live CounterPoint SQL Server and restore it to the migration host.
3. **T+30 Minutes (Delta / Full Catalog & Customer Run):**
   * Run Phases 2, 3, and 4 (since every step uses idempotent `MigrationKeyLedger` + `bulkWrite` upserts, running the pipeline updates current stock quantities in `Inventory`/`InventoryLocation`, new customers in `AR_CUST`, and today's final tickets in `PS_TKT_HIST`).
4. **T+60 Minutes (Verification & POS Sync):**
   * Run the automated reconciliation script (Section 1) and verify 100% match on stock counts, gift card balances, and ticket totals.
   * Boot the Electron POS terminals, let `poll.service.ts` pull the fresh catalog and customer stores, and perform 3 test barcode scans and customer lookups before opening the store.