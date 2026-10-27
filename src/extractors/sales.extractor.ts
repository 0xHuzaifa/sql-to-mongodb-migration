import sql from 'mssql';
import { getSqlPool } from '../config/mssql.client';

export interface TicketHeaderSqlRow {
  DOC_ID: string;
  STR_ID: string;
  STA_ID: string;
  TKT_NO: string;
  BUS_DAT: Date;
  TKT_DT: Date;
  USR_ID: string | null;
  SLS_REP: string | null;
  STK_LOC_ID: string | null;
  CUST_NO: string | null;
  SUB_TOT: number;
  TOT_HDR_DISC: number;
  TOT_LIN_DISC: number;
  TAX_AMT: number;
  TOT: number;
  SAL_LIN_CNT: number;
}

export interface TicketLineSqlRow {
  DOC_ID: string;
  LIN_SEQ_NO: number;
  ITEM_NO: string;
  DESCR: string;
  CATEG_COD: string | null;
  SUBCAT_COD: string | null;
  QTY_SOLD: number;
  PRC: number;
  REG_PRC: number;
  EXT_PRC: number;
  DISC_AMT: number;
  IS_TXBL: string;
  DIM_1_UPR: string | null;
  DIM_2_UPR: string | null;
  DIM_3_UPR: string | null;
}

export interface SafePaymentSqlRow {
  DOC_ID: string;
  PMT_SEQ_NO: number;
  PAY_COD: string;
  AMT: number;
  PMT_LIN_TYP: string | null;
}

export interface TicketHeaderBatch {
  headers: TicketHeaderSqlRow[];
  linesByDocId: Map<string, TicketLineSqlRow[]>;
  paymentsByDocId: Map<string, SafePaymentSqlRow[]>;
  lastDocId: string;
}

/**
 * Fetch a batch of tickets using Keyset seek on DOC_ID
 */
export async function fetchNextTicketBatch(
  lastDocId: string = '0',
  batchSize: number = 1000
): Promise<TicketHeaderBatch | null> {
  const pool = await getSqlPool();

  // 1. Fetch Ticket Headers using Keyset Seek on DOC_ID
  const headerResult = await pool
    .request()
    .input('lastDocId', sql.BigInt, BigInt(lastDocId || '0'))
    .input('batchSize', sql.Int, batchSize)
    .query<TicketHeaderSqlRow>(`
      SELECT TOP (@batchSize)
        CAST(DOC_ID AS VARCHAR(30)) AS DOC_ID,
        STR_ID, STA_ID, TKT_NO, BUS_DAT, TKT_DT,
        USR_ID, SLS_REP, STK_LOC_ID, CUST_NO,
        SUB_TOT, TOT_HDR_DISC, TOT_LIN_DISC, TAX_AMT, TOT,
        ISNULL(SAL_LINS, 0) AS SAL_LIN_CNT
      FROM dbo.PS_TKT_HIST WITH (NOLOCK)
      WHERE DOC_ID > @lastDocId
      ORDER BY DOC_ID ASC;
    `);

  const headers = headerResult.recordset;
  if (headers.length === 0) return null;

  const minDocId = headers[0].DOC_ID;
  const maxDocId = headers[headers.length - 1].DOC_ID;

  // 2. Fetch all Line Items + Cell Dimensions for this exact DOC_ID range in 1 fast query
  const linesResult = await pool
    .request()
    .input('minDocId', sql.BigInt, BigInt(minDocId))
    .input('maxDocId', sql.BigInt, BigInt(maxDocId))
    .query<TicketLineSqlRow>(`
      SELECT 
        CAST(l.DOC_ID AS VARCHAR(30)) AS DOC_ID,
        l.LIN_SEQ_NO, l.ITEM_NO, l.DESCR, l.CATEG_COD, l.SUBCAT_COD,
        l.QTY_SOLD, l.PRC, l.REG_PRC, l.EXT_PRC,
        ISNULL((l.REG_PRC * l.QTY_SOLD) - l.EXT_PRC, 0) AS DISC_AMT,
        l.IS_TXBL,
        l.DIM_1_UPR, l.DIM_2_UPR, l.DIM_3_UPR
      FROM dbo.PS_TKT_HIST_LIN l WITH (NOLOCK)
      WHERE l.DOC_ID BETWEEN @minDocId AND @maxDocId
      ORDER BY l.DOC_ID ASC, l.LIN_SEQ_NO ASC;
    `);

  // 3. Fetch Safe Payment Summaries ONLY (Strictly excluding PS_TKT_HIST_PMT_CR_CARD!)
  const pmtResult = await pool
    .request()
    .input('minDocId', sql.BigInt, BigInt(minDocId))
    .input('maxDocId', sql.BigInt, BigInt(maxDocId))
    .query<SafePaymentSqlRow>(`
      SELECT 
        CAST(DOC_ID AS VARCHAR(30)) AS DOC_ID,
        PMT_SEQ_NO, PAY_COD, AMT, PMT_LIN_TYP
      FROM dbo.PS_TKT_HIST_PMT WITH (NOLOCK)
      WHERE DOC_ID BETWEEN @minDocId AND @maxDocId
      ORDER BY DOC_ID ASC, PMT_SEQ_NO ASC;
    `);

  const linesByDocId = new Map<string, TicketLineSqlRow[]>();
  for (const line of linesResult.recordset) {
    const docId = line.DOC_ID.trim();
    if (!linesByDocId.has(docId)) linesByDocId.set(docId, []);
    linesByDocId.get(docId)!.push({
      ...line,
      DOC_ID: docId,
      ITEM_NO: line.ITEM_NO.trim(),
      DESCR: line.DESCR ? line.DESCR.trim() : line.ITEM_NO.trim(),
      DIM_1_UPR: line.DIM_1_UPR ? line.DIM_1_UPR.trim() : '*',
      DIM_2_UPR: line.DIM_2_UPR ? line.DIM_2_UPR.trim() : '*',
      DIM_3_UPR: line.DIM_3_UPR ? line.DIM_3_UPR.trim() : '*',
    });
  }

  const paymentsByDocId = new Map<string, SafePaymentSqlRow[]>();
  for (const pmt of pmtResult.recordset) {
    const docId = pmt.DOC_ID.trim();
    if (!paymentsByDocId.has(docId)) paymentsByDocId.set(docId, []);
    paymentsByDocId.get(docId)!.push({
      ...pmt,
      DOC_ID: docId,
      PAY_COD: pmt.PAY_COD.trim(),
      AMT: Number(pmt.AMT) || 0,
    });
  }

  return {
    headers,
    linesByDocId,
    paymentsByDocId,
    lastDocId: String(maxDocId),
  };
}
