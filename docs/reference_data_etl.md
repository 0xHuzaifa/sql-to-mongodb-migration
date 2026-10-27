# Part 03: Phase 2 - Reference Data ETL (Locations, Taxonomies, Vendors)

Reference collections have zero external dependencies and must be migrated first so their IDs and string codes are available for Products, Inventory, and Orders.

---

## Step 2.1: Locations & Facilities (`IM_LOC` $\rightarrow$ `Facility` & `Location`)

### 1. Verified Source Data (`results_2.md`)
Your SQL Server `dbo.IM_LOC` table contains exactly 4 rows:
* `MAIN` — Primary Store Location (Chicago, IL)
* `MOBIL` — Mobil Store (Chicago)
* `ONLINE` — Online Store
* `WAREHOUSE` — BackStock Location (Chicago, IL)

### 2. Target Models & Collection Rules
* **`Facility` (`facilities` collection):** Represents the physical site/building. Unique on `facilityId`.
* **`Location` (`locations` collection):** Represents the stockroom/warehouse within a facility. Unique on `warehouseId`.
* **Default Bin Requirement:** Remember that `InventoryLocation.binId` is **`required: true`** in `InventoryLocation.model.ts`, whereas CounterPoint `IM_INV.BIN_1` is often `NULL`. Therefore, every `Location` document must be seeded with a default bin (`binId: "DEFAULT"`, `binCode: "DEFAULT"`) plus any distinct non-null `BIN_1`, `BIN_2`, `BIN_3`, `BIN_4` values found in `IM_INV` for that `LOC_ID`.

### 3. SQL Extraction Query
```sql
SELECT 
    l.LOC_ID, l.DESCR, l.ADRS_1, l.ADRS_2, l.ADRS_3,
    l.CITY, l.STATE, l.ZIP_COD, l.CNTRY,
    l.PHONE_1, l.EMAIL_ADRS_1, l.CONTCT_1, l.RS_STAT
FROM dbo.IM_LOC l;

-- Also fetch all distinct Bin codes per location from IM_INV
SELECT DISTINCT LOC_ID, BIN_CODE
FROM (
    SELECT LOC_ID, BIN_1 AS BIN_CODE FROM dbo.IM_INV WHERE BIN_1 IS NOT NULL AND LTRIM(RTRIM(BIN_1)) <> ''
    UNION
    SELECT LOC_ID, BIN_2 AS BIN_CODE FROM dbo.IM_INV WHERE BIN_2 IS NOT NULL AND LTRIM(RTRIM(BIN_2)) <> ''
    UNION
    SELECT LOC_ID, BIN_3 AS BIN_CODE FROM dbo.IM_INV WHERE BIN_3 IS NOT NULL AND LTRIM(RTRIM(BIN_3)) <> ''
    UNION
    SELECT LOC_ID, BIN_4 AS BIN_CODE FROM dbo.IM_INV WHERE BIN_4 IS NOT NULL AND LTRIM(RTRIM(BIN_4)) <> ''
) b;
```

### 4. Exact Field Mapping (`IM_LOC` $\rightarrow$ `Facility` & `Location`)

| CounterPoint Column | Target `Facility` Path | Target `Location` Path | Transformation Rule |
| :--- | :--- | :--- | :--- |
| `LOC_ID` | `facilityId` & `code` | `warehouseId` & `facilityId` | Trim string. `MAIN`, `MOBIL`, `ONLINE`, `WAREHOUSE`. |
| `DESCR` | `name` | `warehouseName` & `facilityName` | Direct string (`required: true`). |
| `LOC_ID` (Logic) | `type` | `locationType` | For `Facility.type`: `MAIN`/`MOBIL` $\rightarrow$ `"retail_store"`, `WAREHOUSE` $\rightarrow$ `"warehouse"`, `ONLINE` $\rightarrow$ `"other"`. For `Location.locationType`: `MAIN`/`MOBIL` $\rightarrow$ `"showroom"`, `WAREHOUSE` $\rightarrow$ `"warehouse"`, `ONLINE` $\rightarrow$ `"other"`. |
| `LOC_ID` (Logic) | `isPrimary` | `canSellDirectly` | `Facility.isPrimary`: `LOC_ID === 'MAIN'`. `Location.canSellDirectly`: `['MAIN', 'MOBIL', 'ONLINE'].includes(LOC_ID)`. |
| `ADRS_1..3` | `address.street` | `address.street` | `[ADRS_1, ADRS_2, ADRS_3].filter(Boolean).join(', ')` |
| `CITY`, `STATE`, `ZIP_COD`, `CNTRY` | `address.city`, `state`, `zipCode`, `country` | `address.city`, `state`, `zipCode`, `country` | Direct string copy (default `""`). |
| `PHONE_1`, `EMAIL_ADRS_1`, `CONTCT_1` | `contact.phone`, `email`, `managerName` | *N/A* | Direct string copy (default `""`). |
| Distinct `BIN_1..4` | *N/A* | `bins[]` | Always include `{ binId: "DEFAULT", binCode: "DEFAULT", structureType: "bin", isUnlimitedCapacity: true, status: "active" }` plus an entry for each distinct bin code in `IM_INV`. |

---

## Step 2.2: Product Categories (`IM_CATEG_COD` & `IM_SUBCAT_COD` $\rightarrow$ `Taxonomy`)

### 1. Target Schema Rules (`Taxonomy.model.ts`)
* `Taxonomy.category` (`String`, `required: true`, `unique: true`, `trim: true`).
* `Taxonomy.subcategories[]`: Array of `{ name: String (required), description: String }`.
* Note: In `IM_ITEM`, products reference `CATEG_COD` and `SUBCAT_COD`. Some legacy items in `IM_ITEM` might use a `SUBCAT_COD` combination not formally listed in `IM_SUBCAT_COD` (only 10 rows exist in `IM_SUBCAT_COD`).

### 2. SQL Extraction Query (Joining Declared + In-Use Subcategories)
```sql
-- 1. All Parent Categories (19 rows)
SELECT CATEG_COD, DESCR FROM dbo.IM_CATEG_COD;

-- 2. All Subcategories (combining IM_SUBCAT_COD with any active CATEG_COD + SUBCAT_COD pairs on IM_ITEM)
SELECT 
    COALESCE(s.CATEG_COD, i.CATEG_COD) AS CATEG_COD,
    COALESCE(s.SUBCAT_COD, i.SUBCAT_COD) AS SUBCAT_COD,
    MAX(COALESCE(s.DESCR, i.SUBCAT_COD)) AS SUBCAT_DESCR
FROM dbo.IM_SUBCAT_COD s
FULL OUTER JOIN (
    SELECT DISTINCT CATEG_COD, SUBCAT_COD 
    FROM dbo.IM_ITEM 
    WHERE CATEG_COD IS NOT NULL AND SUBCAT_COD IS NOT NULL
) i ON s.CATEG_COD = i.CATEG_COD AND s.SUBCAT_COD = i.SUBCAT_COD
WHERE COALESCE(s.CATEG_COD, i.CATEG_COD) IS NOT NULL
GROUP BY COALESCE(s.CATEG_COD, i.CATEG_COD), COALESCE(s.SUBCAT_COD, i.SUBCAT_COD);
```

### 3. Transformation Rule
1. For each row in `IM_CATEG_COD`, upsert a `Taxonomy` document with `category: row.CATEG_COD.trim()` and `level: 0`.
2. Populate `subcategories` with all matching rows from query #2 (`{ name: sub.SUBCAT_COD.trim(), description: sub.SUBCAT_DESCR?.trim() || '' }`).
3. Also create a fallback `"UNCATEGORIZED"` `Taxonomy` document for any `IM_ITEM` where `CATEG_COD IS NULL`.
4. Store `CATEG_COD -> Taxonomy._id` in `MigrationKeyLedger` (`domain: 'IM_CATEG_COD'`).

---

## Step 2.3: Vendors (`PO_VEND` $\rightarrow$ `Vendor`)

### 1. Target Schema Rules (`Vendor.model.ts`)
* `vendorId`: `String` (`required: true`, `unique: true`). **Must store the exact `VEND_NO` string** (plus create one fallback `"INHOUSE"` vendor for `IM_ITEM` records where `ITEM_VEND_NO IS NULL`).
* `name`: `String` (`required: true`).
* `syncType`: `String` (`required: true`, `enum: ["API", "FTP", "CSV", "INHOUSE"]`). Set to `"INHOUSE"`.

### 2. SQL Extraction Query
```sql
SELECT 
    v.VEND_NO, v.NAM, v.EMAIL_ADRS_1, v.EMAIL_ADRS_2,
    v.PHONE_1, v.PHONE_2, v.CONTCT_1, v.CONTCT_2,
    v.RS_STAT,
    ISNULL(MAX(vi.LEAD_DAYS), 7) AS MAX_LEAD_DAYS
FROM dbo.PO_VEND v
LEFT JOIN dbo.PO_VEND_ITEM vi ON v.VEND_NO = vi.VEND_NO
GROUP BY 
    v.VEND_NO, v.NAM, v.EMAIL_ADRS_1, v.EMAIL_ADRS_2,
    v.PHONE_1, v.PHONE_2, v.CONTCT_1, v.CONTCT_2, v.RS_STAT;
```

### 3. Exact Field Mapping (`PO_VEND` $\rightarrow$ `Vendor`)

| CounterPoint Column | Target `Vendor` Path | Transformation Rule |
| :--- | :--- | :--- |
| `VEND_NO` | `vendorId` | Preserve exact string (e.g., `"00120"`). Also seed a `"INHOUSE"` vendor. |
| `NAM` | `name` | `NAM?.trim() || VEND_NO` (`required: true`). |
| *(Constant)* | `syncType` | `"INHOUSE"` (`required: true`). |
| `MAX_LEAD_DAYS` | `leadTimeDays` | Number (default `7`). |
| `EMAIL_ADRS_1` | `contactEmail` | `EMAIL_ADRS_1?.trim() || ""` |
| `CONTCT_1..2`, `PHONE_1..2`, `EMAIL_ADRS_1..2` | `purchasingContacts[]` | Build array of `{ name, email, phone, role: "Primary" \| "Secondary" }` for non-empty contacts. |