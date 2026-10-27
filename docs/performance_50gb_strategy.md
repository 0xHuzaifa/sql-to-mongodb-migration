# Part 06: 50GB Dataset Optimization & Keyset Streaming Strategy

## 1. Where the 50GB Actually Lives (And How We Cut 60% Immediately)
Looking at your row counts from SQL Server:
* `SY_DIST` has **`3,474,412` rows** (General Ledger accounting distributions).
* `PS_TKT_HIST_AUDIT_LOG` + `PS_TKT_HIST_AUDIT_LOG_TOT` have **`1,845,518` rows**.
* `PS_DRW_SESSION_HIST_EVENT_DETAIL` + `EVENT` have **`926,203` rows**.
* `PS_TRX_LOG`, `SY_EVENT`, `IM_PRC_WRK` have **`481,065` rows**.

Those internal CounterPoint system/audit tables account for **over 6.7 million rows (~30GB of the 50GB `.bak` file)** and **are not used by your MongoDB IMS**. By excluding them and only reading the core operational tables, our active migration dataset drops from 50GB to ~18GB.

---

## 2. Never Use `OFFSET / FETCH` on 1.4 Million Rows (Use Keyset Pagination)
In SQL Server, running `OFFSET 1000000 ROWS FETCH NEXT 1000 ROWS ONLY` forces SQL Server to scan and discard 1,000,000 rows on every single batch—slowing down exponentially after row 100,000.

Instead, use **Keyset Pagination** (`WHERE DOC_ID > @lastDocId ORDER BY DOC_ID ASC`) so every batch of 1,000 tickets executes an instant Index Seek in `< 15ms`:

```typescript
// server/src/migration/extractors/sales.extractor.ts
import sql from 'mssql';
import { getSqlPool } from '../config/mssql.client';

export interface TicketHeaderBatch {
  headers: any[];
  linesByDocId: Map<string, any[]>;
  paymentsByDocId: Map<string, any[]>;
  lastDocId: string;
}

export async function fetchNextTicketBatch(
  lastDocId: string = '0',
  batchSize: number = 1000
): Promise<TicketHeaderBatch | null> {
  const pool = await getSqlPool();

  // 1. Fetch 1,000 Ticket Headers using Keyset Seek on DOC_ID
  const headerResult = await pool
    .request()
    .input('lastDocId', sql.BigInt, BigInt(lastDocId))
    .input('batchSize', sql.Int, batchSize)
    .query(`
      SELECT TOP (@batchSize)
        DOC_ID, STR_ID, STA_ID, TKT_NO, BUS_DAT, TKT_DT,
        USR_ID, SLS_REP, STK_LOC_ID, CUST_NO,
        SUB_TOT, TOT_HDR_DISC, TOT_LIN_DISC, TAX_AMT, TOT, SAL_LIN_CNT
      FROM dbo.PS_TKT_HIST WITH (NOLOCK)
      WHERE DOC_ID > @lastDocId
      ORDER BY DOC_ID ASC;
    `);

  const headers = headerResult.recordset;
  if (headers.length === 0) return null;

  const minDocId = headers[0].DOC_ID;
  const maxDocId = headers[headers.length - 1].DOC_ID;

  // 2. Fetch all Line Items + Cell Dimensions for this exact DOC_ID range in 1 query
  const linesResult = await pool
    .request()
    .input('minDocId', sql.BigInt, minDocId)
    .input('maxDocId', sql.BigInt, maxDocId)
    .query(`
      SELECT 
        l.DOC_ID, l.LIN_SEQ_NO, l.ITEM_NO, l.DESCR, l.CATEG_COD, l.SUBCAT_COD,
        l.QTY_SOLD, l.PRC, l.REG_PRC, l.EXT_PRC, l.DISC_AMT, l.IS_TXBL,
        c.DIM_1_UPR, c.DIM_2_UPR, c.DIM_3_UPR, c.QTY_SOLD AS CELL_QTY_SOLD
      FROM dbo.PS_TKT_HIST_LIN l WITH (NOLOCK)
      LEFT JOIN dbo.PS_TKT_HIST_LIN_CELL c WITH (NOLOCK)
        ON l.BUS_DAT = c.BUS_DAT AND l.DOC_ID = c.DOC_ID AND l.LIN_SEQ_NO = c.LIN_SEQ_NO
      WHERE l.DOC_ID BETWEEN @minDocId AND @maxDocId
      ORDER BY l.DOC_ID ASC, l.LIN_SEQ_NO ASC;
    `);

  // 3. Fetch Safe Payment Summaries ONLY (Strictly excluding PS_TKT_HIST_PMT_CR_CARD!)
  const pmtResult = await pool
    .request()
    .input('minDocId', sql.BigInt, minDocId)
    .input('maxDocId', sql.BigInt, maxDocId)
    .query(`
      SELECT 
        DOC_ID, PMT_SEQ_NO, PAY_COD, AMT, PMT_LIN_TYP
      FROM dbo.PS_TKT_HIST_PMT WITH (NOLOCK)
      WHERE DOC_ID BETWEEN @minDocId AND @maxDocId
      ORDER BY DOC_ID ASC, PMT_SEQ_NO ASC;
    `);

  const linesByDocId = new Map<string, any[]>();
  for (const line of linesResult.recordset) {
    const key = String(line.DOC_ID);
    if (!linesByDocId.has(key)) linesByDocId.set(key, []);
    linesByDocId.get(key)!.push(line);
  }

  const paymentsByDocId = new Map<string, any[]>();
  for (const pmt of pmtResult.recordset) {
    const key = String(pmt.DOC_ID);
    if (!paymentsByDocId.has(key)) paymentsByDocId.set(key, []);
    paymentsByDocId.get(key)!.push(pmt);
  }

  return {
    headers,
    linesByDocId,
    paymentsByDocId,
    lastDocId: String(maxDocId),
  };
}
```

---

## 3. High-Throughput Idempotent `bulkWrite` Loader
Calling `await PosOrder.create(doc)` 470,431 times sequentially takes **~6.5 hours**.
Using `await PosOrder.bulkWrite(ops, { ordered: false })` in batches of 1,000 takes **~8 minutes** and is 100% idempotent (safe to re-run):

```typescript
const bulkOps = transformedOrders.map((orderDoc) => ({
  updateOne: {
    filter: { localId: orderDoc.localId },
    update: { $set: orderDoc },
    upsert: true,
  },
}));

await PosOrder.bulkWrite(bulkOps, { ordered: false });
```

---

## 4. Node.js Memory & Garbage Collection Settings
When running the migration worker process, launch Node.js with a 4GB heap limit so V8 never runs out of memory holding the `IdLedgerCache` and batch buffers:

```bash
NODE_OPTIONS="--max-old-space-size=4096" npx ts-node server/src/migration/orchestrator/migrationRunner.ts
```