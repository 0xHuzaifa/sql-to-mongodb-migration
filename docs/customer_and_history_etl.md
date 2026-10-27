# Part 05: Phase 4 - Customers, Gift Cards, Open Orders & POS Sales History

---

## Step 4.1: Customers & Agency Hierarchies (`AR_CUST` $\rightarrow$ `Page`, `EmployeeGroup`, `User`, `WalkInCustomer`)

### 1. What We Discovered in `results.md` & `results_2.md`
Your `AR_CUST` table (`71,038` rows) has three distinct customer patterns:
1. **`CUST_NAM_TYP` is `'B'` on 99.9% of rows** (`70,985` rows), even for individual people like `Alejandro Santos` (`10913`) or `jasmin butler` (`1`). Therefore, **never use `CUST_NAM_TYP` to classify companies vs. individuals**.
2. **Agency / Corporate Categories (`CATEG_COD`):** You have ~40 distinct agency/company codes in `CATEG_COD` (`LINCOLN`, `KATES`, `JLL`, `CPD`, `GUARDIAN`, `HALO`, `BPG`, `BSA`, `BLUE LINE`, `STARK`, `RUSH`, `METRA`, `CCDOC`, `JTDC`, `CCSD`, etc.).
3. **Parent Account Links (`USER_PARENT_CUST_NO`):** `47,039` rows in `AR_CUST` have `USER_PARENT_CUST_NO` populated (e.g., `CSO R. Bolden` `#10005` and `CSO F. Braun` `#10006` both point to `USER_PARENT_CUST_NO = '2373'`).

### 2. Two-Pass Customer Migration Strategy

#### Pass 1: Identify & Migrate Parent Corporate / Agency Accounts
Run this SQL query to identify every `AR_CUST` record that acts as a **Parent Account** (either because other customers reference its `CUST_NO` in `USER_PARENT_CUST_NO`, or because it is a company master record):

```sql
-- Find all Parent Corporate Accounts in AR_CUST
SELECT p.*
FROM dbo.AR_CUST p
WHERE p.CUST_NO IN (
    SELECT DISTINCT USER_PARENT_CUST_NO 
    FROM dbo.AR_CUST 
    WHERE USER_PARENT_CUST_NO IS NOT NULL AND LTRIM(RTRIM(USER_PARENT_CUST_NO)) <> ''
);
```
* **Mapping Parent Accounts:**
  * Check if a corporate portal (`Page`) or `WalkInCustomer` (with `isCompany: true`) already exists in MongoDB for that agency name/code (`tenantCode: p.CUST_NO` or `CATEG_COD`).
  * Record `p.CUST_NO -> Page._id` in `MigrationKeyLedger` (`domain: 'AR_CUST_PAGE'`).

#### Pass 2: Migrate Individual Customers / Officers (`WalkInCustomer` vs `User`)
* **Default Target (`WalkInCustomer` - `walkincustomers` collection):**
  All retail/walk-in and POS customers (`CUST_TYP = 'C'` or `CUST_TYP = 'A'` without portal login credentials) map cleanly to **`WalkInCustomer`**:
  * `firstName`: If `FST_NAM` is non-empty, use `FST_NAM`. Otherwise split `NAM` on the first space (`NAM.split(' ')[0] || NAM`).
  * `lastName`: If `LST_NAM` is non-empty, use `LST_NAM`. Otherwise use the remainder of `NAM`.
  * `email`: `EMAIL_ADRS_1?.trim().toLowerCase() || ""`
  * `contact`: `[PHONE_1, PHONE_2, MBL_PHONE_1, MBL_PHONE_2].filter(Boolean).map(p => ({ type: 'phone', phone: p.trim() }))`
  * `address`: `{ street: [ADRS_1, ADRS_2].filter(Boolean).join(', '), city: CITY || '', state: STATE || '', zip: ZIP_COD || '' }`
  * `discountPercent`: `Math.min(100, Math.max(0, Number(DISC_PCT) || 0))`
  * `isTaxExempt`: `Boolean(TAX_EXEMPT_NO && TAX_EXEMPT_NO.trim() !== '')`
  * `taxExemptNumber`: `TAX_EXEMPT_NO?.trim() || ""`
  * `taxId`: `TAX_COD?.trim() || ""`
  * `companies`: If the customer has `CATEG_COD` (e.g., `'CPD'`, `'LINCOLN'`) or `USER_PARENT_CUST_NO`, populate `isCompany: true` and push to `companies[]`:
    ```json
    {
      "companyName": "CPD (or Parent Account NAM)",
      "allotmentType": "money",
      "totalAllotment": 0,
      "usedAllotment": 0,
      "allotmentValue": 0,
      "isUnlimited": false
    }
    ```
    *(Note per Rule #3: Do **not** automatically copy CounterPoint `CR_LIM` or `BAL` into `totalAllotment` without business sign-off!)*

---

## Step 4.2: Gift Cards (`SY_GFC` & `SY_GFC_ACTIV` $\rightarrow$ `GiftCard`)

### 1. Target Schema Constraints (`GiftCard.model.ts`)
* `GiftCard` uses `barcode` (`required: true, unique: true`), `initialBalance`, `currentBalance`, `isActive`, and `transactions[]`.
* It does **not** declare `cardNumber` or `expirationDate`.

### 2. SQL Extraction & Mapping
```sql
SELECT GFC_NO, ORIG_AMT, CURR_AMT, IS_VOID, ORIG_DAT, ORIG_DOC_NO 
FROM dbo.SY_GFC;

SELECT GFC_NO, SEQ_NO, ACTIV_DAT, ACTIV_TYP, AMT, DOC_NO, USR_ID, COMMNT
FROM dbo.SY_GFC_ACTIV
ORDER BY GFC_NO, SEQ_NO ASC;
```
* `barcode`: `GFC_NO.trim()` (Ensure any gift card identifier policy is approved per Rule #5).
* `initialBalance`: `Number(ORIG_AMT) || 0`
* `currentBalance`: `Number(CURR_AMT) || 0`
* `isActive`: `IS_VOID !== 'Y' && Number(CURR_AMT) > 0`
* `transactions[]`: Map each `SY_GFC_ACTIV` row to `{ type: mapActivTyp(ACTIV_TYP), amount: Math.abs(AMT), balanceAfter: runningBalance, referenceId: DOC_NO, cashierName: USR_ID, notes: COMMNT, createdAt: ACTIV_DAT }`, where `type` is one of `["issue", "redemption", "reload", "void"]`.

---

## Step 4.3: Historical POS Sales (`PS_TKT_HIST` $\rightarrow$ `PosOrder`)

### 1. Scale & Strict Rules
* `PS_TKT_HIST` has **`470,431` headers** and `PS_TKT_HIST_LIN` has **`1,409,426` line items**.
* **Rule #5 (PCI Exclusion):** Never read from `PS_TKT_HIST_PMT_CR_CARD`. Never populate `PosOrder.cardLast4`, `PosOrder.cardAuthCode`, `PosOrder.paymentProcessorTxnId`, or raw payment objects inside `receiptData`.
* **Rule #6 (No Side Effects):** Insert directly into `PosOrder` (`posorders` collection) via `PosOrder.collection.bulkWrite()`. Never call live POS checkout services.

### 2. Field Mapping (`PS_TKT_HIST` + Lines + Safe Tender Summaries $\rightarrow$ `PosOrder`)

| CounterPoint Source | Target `PosOrder` Path | Transformation Rule |
| :--- | :--- | :--- |
| `'CP-' + DOC_ID` (or `STR_ID + '-' + STA_ID + '-' + TKT_NO`) | `localId` | Unique string (`required: true, unique: true`). |
| `STA_ID` / `STR_ID` | `terminalId`, `counterNo` | `STA_ID || 'CP-HIST'` (`required: true`). |
| `USR_ID` / `SLS_REP` | `cashierName` | `USR_ID || SLS_REP || 'Legacy Cashier'` (`required: true`). |
| `STK_LOC_ID` / `STR_ID` | `facilityId`, `locationId` | Exact `IM_LOC.LOC_ID` string (`MAIN`, `MOBIL`, etc.). |
| `SUB_TOT` | `subtotal` | `Number(SUB_TOT) || 0` |
| `TOT_HDR_DISC` + `TOT_LIN_DISC` | `discountTotal` | `Number(TOT_DISC) || 0` |
| `TAX_AMT` | `taxTotal` | `Number(TAX_AMT) || 0` |
| `TOT` | `totalAmount` | `Number(TOT) || 0` (`required: true`). |
| `PS_TKT_HIST_PMT.PAY_COD` | `paymentMethod` & `payments[]` | Map safe tender codes only (`CASH`, `CHECK`, `AR`, `GFC`, `CARD_SUMMARY`) with `{ method: PAY_COD, amount: AMT }`. **Strip all card numbers, auth codes, and track data!** |
| `PS_TKT_HIST_LIN` + `PS_TKT_HIST_LIN_CELL` | `items[]` | Map `ITEM_NO` + cell dims to `Variant._id` (`variantId`), `Product._id` (`productId`), `sku`, `productName: DESCR`, `qty: QTY_SOLD`, `price: PRC`, `originalPrice: REG_PRC`, `discountAmount: DISC_AMT`. |
| `BUS_DAT` / `TKT_DT` | `createdAt`, `syncTimestamp` | Preserve original historical sale timestamp! |

---

## Step 4.4: Drawer History (`PS_DRW_SESSION_HIST`) & Open A/R (`AR_OPN_ITEM`)
* **`PS_DRW_SESSION_HIST` (`78,417` rows) $\rightarrow$ `CounterPointReportArchive`:**
  * Map `DRW_ID + '-' + SESSION_ID` $\rightarrow$ `reportId`, `STR_ID + ' Drawer ' + DRW_ID` $\rightarrow$ `reportName`, `reportType: "EOD_ZOUT"`, `OPEN_DT` $\rightarrow$ `periodStart`, `CLOSE_DT` $\rightarrow$ `periodEnd`, leaving sensitive payment fields out of `rawData`.
* **`AR_OPN_ITEM` (`265,119` rows) $\rightarrow$ A/R Reconciliation / `Invoice`:**
  * As noted in `SYSTEM_COLLECTIONS_SCHEMA.md`, `Invoice` in IMS is structured around portal/walk-in company order summaries (`lineItems[].orderId`), **not** a raw CounterPoint A/R ledger. Do not blindly dump `AR_OPN_ITEM` into `invoices`; first export an A/R aging reconciliation report by `CUST_NO` (`DOC_TYP = 'I'` vs `'P'`/`'C'` applications in `AR_OPN_APPLY_TO`) and only generate `Invoice` documents for active open corporate balances approved by accounting.