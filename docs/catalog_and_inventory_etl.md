# Part 04: Phase 3 - Catalog, Grid Variants & Inventory ETL

This is the core operational heart of the migration. It transforms `6,122` items (`IM_ITEM`), `43,342` SKUs (`IM_SKU`), `43,230` barcodes (`IM_BARCOD`), `37,655` price records (`IM_PRC`), and `180,202` inventory records (`IM_INV` + `IM_INV_CELL`) into `Product`, `Attribute`, `Variant`, `Inventory`, and `InventoryLocation`.

---

## Step 3.1: Parent Products (`IM_ITEM` $\rightarrow$ `Product`)

### 1. Critical Schema Constraints (`Product.model.ts`)
* `name`: `required: true`, **`minLength: 3`**, `maxLength: 200`. If `IM_ITEM.DESCR` is shorter than 3 characters (e.g., `"A"` or `""`), pad it as `${DESCR} (${ITEM_NO})` so Mongoose validation never fails!
* `vendorId`: `String` (`required: true`). Map from `IM_ITEM.ITEM_VEND_NO`. If `NULL` or not found in `PO_VEND`, fallback to `"INHOUSE"`.
* `productMasterSku`: `String`. Map from `IM_ITEM.ITEM_NO`. Unique index on `{ vendorId: 1, productMasterSku: 1 }`.
* `itemType`: Enum `["Inventory", "Non-inventory", "Service", "Discount"]`.

### 2. Field Mapping Table (`IM_ITEM` $\rightarrow$ `Product`)

| CounterPoint `IM_ITEM` Column | Target `Product` Path | Transformation Rule |
| :--- | :--- | :--- |
| `ITEM_VEND_NO` | `vendorId` | String lookup in `Vendor`; fallback to `"INHOUSE"`. |
| *(Constant)* | `syncType` | `"INHOUSE"` |
| `ITEM_NO` | `productMasterSku` | Exact `ITEM_NO` string. |
| `DESCR` | `name` | Trim; if `.length < 3`, use `${DESCR.trim()} - ${ITEM_NO}`. Truncate at 200 chars. |
| `LONG_DESCR`, `SHORT_DESCR` | `description` | `LONG_DESCR || SHORT_DESCR || ""` |
| `ADDL_DESCR_1`, `2`, `3` | `additionalDescription1`, `2`, `3` | Direct string (default `""`). |
| `ATTR_COD_1` (or `PROF_COD_1`) | `brand`, `manufacturer` | Trim string or `null`. |
| `CATEG_COD` | `category` | Exact `Taxonomy.category` string (or `"UNCATEGORIZED"`). |
| `SUBCAT_COD` | `subcategory` | Trim string or `null`. |
| `STAT` | `status` | `STAT === 'A' ? 'active' : 'archived'` |
| `ITEM_TYP` | `itemType` | `'I'` $\rightarrow$ `'Inventory'`, `'N'` $\rightarrow$ `'Non-inventory'`, `'S'` $\rightarrow$ `'Service'`, `'D'` $\rightarrow$ `'Discount'` (default `'Inventory'`). |
| `IS_DISCNTBL` | `discountable` | `IS_DISCNTBL === 'Y'` |
| `IS_TXBL` | `taxable` | `IS_TXBL === 'Y'` |
| `TAX_CATEG_COD` | `taxCategory` | Trim string or `null`. |
| `WARR_PRD_1`, `WARR_PRD_2` | `warrentyPeriod1`, `warrentyPeriod2` | `Math.max(0, Number(val) || 0)` |
| `BARCOD` | `barcode`, `upc` | Trim string or `null`. |

---

## Step 3.2: Dynamic Grid Dimension Normalizer & Variants (`Variant` & `Attribute`)

### 1. Solving the Grid Dimension Chaos (Verified from `results.md`)
In `results.md`, we discovered 42 distinct combinations of `GRID_DIM_1_TAG`, `GRID_DIM_2_TAG`, and `GRID_DIM_3_TAG` across your gridded items, including:
* Reversed positions (`COLOR | SIZE` vs `Size | Color` vs `SIZE | HAND` vs `Hand | Size | Finish`).
* Typos (`Sisez`, `SOZE`, `HIEGHT`, `COLORS`, `SIZES`).
* Extra uniform dimensions (`HAND`, `Neck`, `Sleeve`, `Finish`, `Lining`, `WIDTH`, `CUP`, `SIDE`, `STYLE`, `Rank`, `PIN TYPE`, `Designator Pin`, `Border`).
* Values accidentally typed into the tag field (`BLACK`, `BROWN`, `TAN`, `BEANIE`, `CAP`, `PATCH`, `Select one`).

### 2. Complete TypeScript Tag Normalizer (`dimensionMap.config.ts`)
Per **Rule #2** of `SYSTEM_COLLECTIONS_SCHEMA.md` (*"Retain original tags and values for dimensions such as Hand, Finish, Neck and Sleeve; review typo aliases individually"*), use this exact resolver:

```typescript
// server/src/migration/config/dimensionMap.config.ts

export type TargetDimensionBucket = 
  | { target: 'size' }
  | { target: 'color' }
  | { target: 'length' }
  | { target: 'additionalAttributes'; attributeKey: string; originalTag: string; flagWarning?: boolean };

const SIZE_ALIASES = new Set(['SIZE', 'SIZES', 'SISEZ', 'SOZE']);
const COLOR_ALIASES = new Set(['COLOR', 'COLORS']);
const LENGTH_ALIASES = new Set(['LENGTH', 'HEIGHT', 'HIEGHT', 'INSEAM']);

// Tags where someone accidentally typed a color/item value into the Tag header in CounterPoint
const ANOMALOUS_VALUE_TAGS = new Set([
  'BLACK', 'BROWN', 'TAN', 'BEANIE', 'CAP', 'PATCH', 'SELECT ONE', 'G', 'GC NUMBER', 'QUANTITY'
]);

export function resolveDimensionTag(rawTag: string | null | undefined, slotIndex: 1 | 2 | 3): TargetDimensionBucket {
  if (!rawTag || !rawTag.trim()) {
    return { target: 'additionalAttributes', attributeKey: `dim_${slotIndex}`, originalTag: '' };
  }
  const clean = rawTag.trim();
  const upper = clean.toUpperCase();

  if (SIZE_ALIASES.has(upper)) return { target: 'size' };
  if (COLOR_ALIASES.has(upper)) return { target: 'color' };
  if (LENGTH_ALIASES.has(upper)) return { target: 'length' };

  if (ANOMALOUS_VALUE_TAGS.has(upper)) {
    return {
      target: 'additionalAttributes',
      attributeKey: clean.toLowerCase().replace(/\s+/g, '_'),
      originalTag: clean,
      flagWarning: true, // Logs a warning in CounterPointMigration for human review
    };
  }

  // Preserves Hand, Finish, Neck, Sleeve, Width, Cup, Side, Style, Lining, Rank, Pin Type, etc.
  return {
    target: 'additionalAttributes',
    attributeKey: clean.toLowerCase().replace(/\s+/g, '_'),
    originalTag: clean,
  };
}
```

### 3. Discovering All Valid Variant Cells per `IM_ITEM`
How do we know every variant cell that exists for a gridded item (`TRK_METH = 'G'`)?
In CounterPoint, a variant cell might exist in `IM_INV_CELL` (stock), `IM_BARCOD` (barcodes), `IM_PRC` (pricing), or `IM_SKU`. To ensure **zero orphaned variants**, extract the union of cells per `ITEM_NO`:

```sql
-- Union of all active variant dimension cells across CounterPoint catalog tables
SELECT DISTINCT 
    c.ITEM_NO,
    c.DIM_1_UPR,
    c.DIM_2_UPR,
    c.DIM_3_UPR,
    d1.DIM_1 AS DISPLAY_DIM_1,
    d2.DIM_2 AS DISPLAY_DIM_2,
    d3.DIM_3 AS DISPLAY_DIM_3
FROM (
    SELECT ITEM_NO, DIM_1_UPR, DIM_2_UPR, DIM_3_UPR FROM dbo.IM_INV_CELL
    UNION
    SELECT ITEM_NO, DIM_1_UPR, DIM_2_UPR, DIM_3_UPR FROM dbo.IM_BARCOD WHERE DIM_1_UPR <> '*' OR DIM_2_UPR <> '*' OR DIM_3_UPR <> '*'
    UNION
    SELECT ITEM_NO, UPPER(ISNULL(DIM_1, '*')), UPPER(ISNULL(DIM_2, '*')), UPPER(ISNULL(DIM_3, '*')) FROM dbo.IM_SKU
) c
LEFT JOIN dbo.IM_GRID_DIM_1 d1 ON c.ITEM_NO = d1.ITEM_NO AND c.DIM_1_UPR = d1.DIM_1_UPR
LEFT JOIN dbo.IM_GRID_DIM_2 d2 ON c.ITEM_NO = d2.ITEM_NO AND c.DIM_2_UPR = d2.DIM_2_UPR
LEFT JOIN dbo.IM_GRID_DIM_3 d3 ON c.ITEM_NO = d3.ITEM_NO AND c.DIM_3_UPR = d3.DIM_3_UPR;
```

### 4. Constructing `Variant.sku` and `Variant.masterSku`
In `Variant.model.ts`:
* `masterSku` is **globally unique** (`{ masterSku: 1 }, { unique: true }`).
* `{ vendorId: 1, sku: 1 }` is **unique**.
* **For Non-Gridded Items (`TRK_METH != 'G'`):**
  * Create exactly 1 `Variant` where `sku = ITEM_NO` and `masterSku = ITEM_NO`.
* **For Gridded Items (`TRK_METH == 'G'`):**
  * Filter out wildcard `"*"` or empty dimensions and join with `-`:
  * Example: `ITEM_NO = "SHIRT01"`, `DIM_1_UPR = "NAVY"`, `DIM_2_UPR = "XL"`, `DIM_3_UPR = "*"` $\rightarrow$ `sku = "SHIRT01-NAVY-XL"`, `masterSku = "SHIRT01-NAVY-XL"`.
  * Store `additionalAttributes.cpCellKey = "${ITEM_NO}|${DIM_1_UPR}|${DIM_2_UPR}|${DIM_3_UPR}"` and `additionalAttributes.cpDimTags = { dim1: GRID_DIM_1_TAG, dim2: GRID_DIM_2_TAG, dim3: GRID_DIM_3_TAG }` so the POS and migration scripts always have the exact source cell coordinates!

### 5. Mapping Barcodes (`IM_BARCOD`) & Prices (`IM_PRC`) onto `Variant`
* **Barcodes (`IM_BARCOD`):**
  * Match `IM_BARCOD` rows by `(ITEM_NO, DIM_1_UPR, DIM_2_UPR, DIM_3_UPR)` ordered by `SEQ_NO ASC`.
  * Set `Variant.barcode = barcodes[0].BARCOD` (and `Variant.upc = barcodes[0].BARCOD`).
  * Set `Variant.additionalBarcodes = barcodes.map(b => b.BARCOD)` (including all alternate barcodes so POS scanners can scan any barcode in `additionalBarcodes`).
* **Pricing (`IM_ITEM` + `IM_PRC`):**
  * Base price comes from `IM_ITEM.PRC_1` (`Variant.price`) and `IM_ITEM.REG_PRC` (`Variant.regularPrice`, `Variant.originalPrice`).
  * If a cell-specific or location-specific (`LOC_ID = 'MAIN'` or `'*'`) price row exists in `IM_PRC`, override `Variant.price = IM_PRC.PRC_1`, `Variant.alternatePrice1 = IM_PRC.PRC_2`, `Variant.alternatePrice2 = IM_PRC.PRC_3`, `Variant.alternatePrice3 = IM_PRC.PRC_4`.
  * Cost comes from `IM_ITEM.LST_COST` (or `PO_VEND_ITEM.UNIT_COST`) $\rightarrow$ `Variant.costPrice` and `Variant.lastCost` (clamp with `Math.max(0, cost)` since Mongoose enforces `min: 0`).

---

## Step 3.3: Inventory & Physical Locations (`IM_INV` & `IM_INV_CELL` $\rightarrow$ `Inventory` & `InventoryLocation`)

### 1. Crucial Schema & Hook Rules (`SYSTEM_COLLECTIONS_SCHEMA.md`)
1. **Collection Name:** `Inventory` uses **`inventory`** (singular), and is unique on `{ vendorId, vendorSku }` and `{ masterSku }`. That means there is **one `Inventory` summary document per `Variant`**, aggregating stock across your 4 locations (`MAIN`, `MOBIL`, `ONLINE`, `WAREHOUSE`).
2. **Pre-Validate Hook:** `Inventory.model.ts` has a `pre("validate")` hook that overwrites:
   $$\text{qtyAvailable} = \max(0, \text{qtyOnHand} - \text{qtyReserved} - \text{qtyAllocated})$$
3. **Committed Stock Reconciliation:** In CounterPoint (`IM_INV` / `IM_INV_CELL`), committed stock is held in `QTY_COMMIT` (which includes `QTY_ON_SO` + `QTY_ON_ORD` + `QTY_ON_LWY`). Map summed `QTY_COMMIT` (clamped $\ge 0$) to `Inventory.qtyReserved` so the hook computes the exact same `qtyAvailable` as CounterPoint!
4. **Minimum Quantity on `InventoryLocation`:** `InventoryLocation.quantity` enforces **`min: 1`**. CounterPoint has many rows in `IM_INV_CELL` where `QTY_ON_HND <= 0`.
   * **Policy:** Only insert an `InventoryLocation` document when a location's `QTY_ON_HND >= 1`.
   * If a location has negative stock (`QTY_ON_HND < 0`), do **not** create an `InventoryLocation` document; instead, record the raw location numbers inside `Inventory.vendorRawData.cpLocations` and log a `warning` entry in `CounterPointMigration` for physical count reconciliation.

### 2. Field Mapping (`IM_INV` / `IM_INV_CELL` $\rightarrow$ `Inventory` & `InventoryLocation`)

| Source Calculation | Target `Inventory` (`inventory`) | Target `InventoryLocation` (`inventorylocations`) |
| :--- | :--- | :--- |
| Parent `Product._id` | `productId` (`ObjectId`) | *N/A* |
| `Variant._id` | `variantId` (`ObjectId`) | `variantId` (`ObjectId`) |
| `Variant.vendorId` | `vendorId` (`String`) | *N/A* |
| `Variant.sku` / `masterSku` | `vendorSku` & `masterSku` | *N/A* |
| *(Constant)* | `origin: "inhouse"`, `syncType: "inhouse"` | *N/A* |
| $\sum \text{QTY\_ON\_HND}$ across `LOC_ID`s | `qtyOnHand` (preserve actual sum or clamp $\ge 0$ per policy) | Per-location `quantity: row.QTY_ON_HND` (**only if $\ge 1$**) |
| $\sum \max(0, \text{QTY\_COMMIT})$ | `qtyReserved` | *N/A* |
| $\sum \max(0, \text{QTY\_ON\_PO})$ | `qtyOnOrder` (`min: 0`) | *N/A* |
| $\sum \max(0, \text{QTY\_ON\_BO})$ | `qtyBackordered` (`min: 0`) | *N/A* |
| $\sum \max(0, \text{ MIN\_QTY })$, $\max(\text{MAX\_QTY})$ | `minQty`, `maxQty` | *N/A* |
| `IM_INV.LOC_ID` & `IM_INV.BIN_1` | `location.warehouseId: "MAIN"`, `location.binCode: BIN_1 \|\| "DEFAULT"` | `warehouseId: row.LOC_ID`, `binId: row.BIN_1 \|\| "DEFAULT"` |
| Per-location raw SQL breakdown | `vendorRawData: { cpByLocation: [...] }` | *N/A* |