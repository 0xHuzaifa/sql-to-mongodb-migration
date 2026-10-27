# 50GB NCR CounterPoint to MongoDB IMS: Migration Master Plan

## 1. Executive Summary
This master plan governs the end-to-end Extract, Transform, and Load (ETL) migration of a **50GB NCR CounterPoint SQL Server database** (`.bak` restore) into the target **MongoDB Inventory Management System (IMS)** and **Electron POS (NeDB)** ecosystem.

Because the target MongoDB database already enforces **75 Mongoose models** (`server/src/models/`) with strict schemas, pre-save/pre-validate hooks, composite unique indexes, and mixed reference types (`String` codes vs. `ObjectId` references), generic "lift-and-shift" migration tools will corrupt data integrity. This migration uses a dedicated, idempotent **Node.js + TypeScript ETL Engine** paired with a **Migration Control Dashboard**.

---

## 2. Master Document Index

| Document | Filepath | Scope & Contents |
| :--- | :--- | :--- |
| **Part 00** | `docs/migration/00-MASTER-INDEX.md` | Executive overview, DBA `.bak` restore checklist, source-to-target volume matrix, and global non-negotiable rules. |
| **Part 01** | `docs/migration/01-architecture-overview.md` | Full-stack migration app architecture, folder structure, connection pooling (`mssql` + `mongoose`), and dashboard endpoints. |
| **Part 02** | `docs/migration/02-phase1-discovery-and-ledger.md` | The `MigrationKeyLedger` model, preserving leading zeros/spaces, in-memory `Map` lookup caching, and pre-flight SQL profiling. |
| **Part 03** | `docs/migration/03-phase2-reference-data-etl.md` | Step-by-step ETL & code for `IM_LOC` ($\rightarrow$ `Facility`, `Location`), `IM_CATEG_COD`/`IM_SUBCAT_COD` ($\rightarrow$ `Taxonomy`), and `PO_VEND` ($\rightarrow$ `Vendor`). |
| **Part 04** | `docs/migration/04-phase3-catalog-and-inventory-etl.md` | Step-by-step ETL for `IM_ITEM` ($\rightarrow$ `Product`), Dynamic Grid Tag Normalizer (`Sisez`, `SOZE`, `HIEGHT`, swapped `DIM_1..3` $\rightarrow$ `Variant`), `IM_BARCOD`, `IM_PRC`, and `IM_INV`/`IM_INV_CELL` ($\rightarrow$ `Inventory`, `InventoryLocation`). |
| **Part 05** | `docs/migration/05-phase4-customer-and-history-etl.md` | Step-by-step ETL for `AR_CUST` (`USER_PARENT_CUST_NO` hierarchy $\rightarrow$ `Page`, `EmployeeGroup`, `User`, `WalkInCustomer`), `SY_GFC` ($\rightarrow$ `GiftCard`), `PS_TKT_HIST` ($\rightarrow$ `PosOrder`), and `AR_OPN_ITEM` ($\rightarrow$ `Invoice`). |
| **Part 06** | `docs/migration/06-performance-50gb-strategy.md` | Handling the 50GB `.bak` file: ignoring the 3.47M row `SY_DIST` bloat, SQL Server keyset pagination, streaming cursors, and MongoDB `bulkWrite` batching. |
| **Part 07** | `docs/migration/07-error-handling-and-dead-letter.md` | Bypassing vs. respecting Mongoose hooks, batch-to-single fallback isolation, `CounterPointMigration` audit logging, and Dead-Letter retry queues. |
| **Part 08** | `docs/migration/08-testing-and-cutover-playbook.md` | Reconciliation SQL vs. MongoDB queries, Electron POS NeDB sync order (`poll.service.ts`), dry-run stages, and live cutover runbook. |

---

## 3. Source-to-Target Volume Matrix (Verified from Production SQL Snapshot)

| Execution Phase | CounterPoint SQL Table(s) | SQL Row Count | Target MongoDB Collection(s) | Target Mongoose Model(s) |
| :--- | :--- | ---: | :--- | :--- |
| **Ignore / Skip** | `SY_DIST`, `SY_EVENT`, `PS_TRX_LOG`, `IM_PRC_WRK` | `4,884,962` | *None (Do Not Migrate)* | *N/A — GL & Temp Work Tables* |
| **Ignore / Skip (PCI)** | `PS_TKT_HIST_PMT_CR_CARD`, `AR_CUST_CARDS`, `SY_EDC_HIST` | `347,298` | *None (Strict PCI Exclusion)* | *N/A — Forbidden Payment Data* |
| **Phase 2.1** | `IM_LOC`, `PS_STR` | `7` | `facilities`, `locations` | `Facility`, `Location` |
| **Phase 2.2** | `IM_CATEG_COD`, `IM_SUBCAT_COD` | `29` | `taxonomies` | `Taxonomy` |
| **Phase 2.3** | `PO_VEND`, `PO_VEND_ITEM` | `5,159` | `vendors`, `vendormappings` | `Vendor`, `VendorMapping` |
| **Phase 3.1** | `IM_ITEM` | `6,122` | `products` | `Product` |
| **Phase 3.2** | `IM_SKU`, `IM_GRID_DIM_1..3`, `IM_BARCOD`, `IM_PRC` | `152,874` | `variants`, `attributes` | `Variant`, `Attribute` |
| **Phase 3.3** | `IM_INV`, `IM_INV_CELL` | `180,202` | `inventory`, `inventorylocations` | `Inventory`, `InventoryLocation` |
| **Phase 4.1** | `AR_CUST`, `AR_CATEG_COD`, `AR_CUST_PROF_COD` | `71,510` | `pages`, `employeegroups`, `users`, `walkincustomers` | `Page`, `EmployeeGroup`, `User`, `WalkInCustomer` |
| **Phase 4.2** | `SY_GFC`, `SY_GFC_ACTIV` | `2,142` | `giftcards` | `GiftCard` |
| **Phase 4.3** | `PS_TKT_HIST`, `PS_TKT_HIST_LIN`, `PS_TKT_HIST_LIN_CELL`, `PS_TKT_HIST_PMT`, `PS_TKT_HIST_TAX`, `PS_TKT_HIST_DISC` | `3,801,464` | `posorders` | `PosOrder` |
| **Phase 4.4** | `PS_DOC_HDR`, `PS_DOC_LIN`, `PS_ORD_HIST`, `PS_LWY_HIST` | `17,581` | `orders`, `posorders` | `Order`, `PosOrder` |
| **Phase 4.5** | `PS_DRW_SESSION_HIST`, `AR_OPN_ITEM` | `343,536` | `counterpointreportarchives`, `invoices` | `CounterPointReportArchive`, `Invoice` |

---

## 4. Checklist for the Team Member Holding the 50GB `.bak` File

Before the Node.js migration engine connects to SQL Server, the database holder must complete these 5 preparation steps:

1. **Restore the `.bak` to a Local/Staging SQL Server Instance:**
   * Use SQL Server 2019 or 2022 Developer/Standard Edition.
   * Provision at least **80GB of SSD disk space** (50GB data + 20GB `tempdb` + 10GB transaction log headroom).
   ```sql
   RESTORE FILELISTONLY FROM DISK = N'C:\Backups\CounterPoint_50GB.bak';
   
   RESTORE DATABASE [CounterPoint_Staging]
   FROM DISK = N'C:\Backups\CounterPoint_50GB.bak'
   WITH MOVE N'CPSQL_Data' TO N'C:\SQLData\CounterPoint_Staging.mdf',
        MOVE N'CPSQL_Log'  TO N'C:\SQLData\CounterPoint_Staging.ldf',
        STATS = 5, RECOVERY;
   ```
2. **Set Recovery Model to `SIMPLE` and Shrink Logs:**
   * Since this staging SQL database is read-only for migration, set recovery to `SIMPLE` so SQL Server does not bloat the disk during index creation:
   ```sql
   ALTER DATABASE [CounterPoint_Staging] SET RECOVERY SIMPLE;
   ```
3. **Create Covering Read Indexes for Heavy Historical Tables:**
   * Joining `PS_TKT_HIST` (470K rows) with `PS_TKT_HIST_LIN` (1.4M rows) and `PS_TKT_HIST_LIN_CELL` (641K rows) will time out without composite indexes on `(BUS_DAT, DOC_ID, LIN_SEQ_NO)`:
   ```sql
   USE [CounterPoint_Staging];
   GO
   CREATE NONCLUSTERED INDEX IX_Mig_TktHist_BusDat_DocId 
   ON dbo.PS_TKT_HIST (BUS_DAT ASC, DOC_ID ASC);

   CREATE NONCLUSTERED INDEX IX_Mig_TktHistLin_DocId_Seq 
   ON dbo.PS_TKT_HIST_LIN (BUS_DAT ASC, DOC_ID ASC, LIN_SEQ_NO ASC);

   CREATE NONCLUSTERED INDEX IX_Mig_TktHistLinCell_DocId_Seq 
   ON dbo.PS_TKT_HIST_LIN_CELL (BUS_DAT ASC, DOC_ID ASC, LIN_SEQ_NO ASC);
   ```
4. **Enable TCP/IP & Create a Read-Only SQL Login:**
   * Open **SQL Server Configuration Manager** $\rightarrow$ Enable **TCP/IP** on port `1433`.
   * Create a read-only user (`cp_migration_reader`) so the migration script can never accidentally mutate the source SQL database:
   ```sql
   USE [master];
   CREATE LOGIN [cp_migration_reader] WITH PASSWORD = N'StrongMigrationPass!2026';
   USE [CounterPoint_Staging];
   CREATE USER [cp_migration_reader] FOR LOGIN [cp_migration_reader];
   ALTER ROLE [db_datareader] ADD MEMBER [cp_migration_reader];
   ```

---

## 5. Seven Non-Negotiable Migration Rules (From `SYSTEM_COLLECTIONS_SCHEMA.md`)

1. **Preserve Exact String Identifiers:** Never cast `ITEM_NO`, `CUST_NO`, `VEND_NO`, or `BARCOD` to integers. Preserve leading zeros, casing, and meaningful spaces.
2. **Dynamic Grid Dimension Resolution:** Never assume `DIM_1 = Color` and `DIM_2 = Size`. Always inspect `IM_ITEM.GRID_DIM_1_TAG`, `GRID_DIM_2_TAG`, and `GRID_DIM_3_TAG` per item.
3. **Customer Classification Profiling:** `CUST_NAM_TYP = 'B'` is set on 99.9% of rows in `AR_CUST` (including individual officers). Use `CATEG_COD` and `USER_PARENT_CUST_NO` to separate parent corporate agencies from individual personnel.
4. **Respect Target Collection Names & Hooks:** `Inventory` uses collection **`inventory`** (not `inventories`) and recalculates `qtyAvailable = Math.max(0, qtyOnHand - qtyReserved - qtyAllocated)` in a `pre("validate")` hook. `InventoryLocation.quantity` enforces `min: 1`.
5. **Strict Payment-Data Exclusion (PCI Compliance):** Never copy card numbers (even masked), track data, CVVs, PINs, auth codes, or raw payment payloads into `PosOrder`, `receiptData`, or migration logs.
6. **Never Use Live Checkout Endpoints for Historical Tickets:** Historical sales (`PS_TKT_HIST`) must be bulk-inserted directly into `posorders` without deducting current inventory or consuming employee credit allotments.
7. **Respect Electron POS Sync Dependencies:** Server `Product`, `Variant`, `Inventory`, and `WalkInCustomer`/`User` records must be migrated and verified before POS terminals refresh their local NeDB datastores (`products.db`, `customers.db`, `sales.db`).