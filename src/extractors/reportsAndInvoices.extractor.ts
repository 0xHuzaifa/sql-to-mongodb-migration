import sql from 'mssql';
import { getSqlPool } from '../config/mssql.client';

export interface DrawerSessionSqlRow {
  DRW_ID: string;
  SESSION_ID: string;
  STR_ID: string;
  OPEN_DT: Date | null;
  CLOSE_DT: Date | null;
  USR_ID: string | null;
  TOT_SAL: number;
  TOT_TAX: number;
  SAL_TKT_CNT: number;
}

export interface OpenItemSqlRow {
  CUST_NO: string;
  DOC_NO: string;
  DOC_DAT: Date;
  DOC_TYP: string;
  AMT: number;
  BAL: number;
  TERMS_COD: string | null;
  DUE_DAT: Date | null;
}

/**
 * Fetch a paged batch of Drawer Sessions (PS_DRW_SESSION_HIST)
 */
export async function fetchDrawerSessions(
  lastSessionId: string = '0',
  batchSize: number = 2500
): Promise<DrawerSessionSqlRow[]> {
  const pool = await getSqlPool();

  const result = await pool
    .request()
    .input('lastSessionId', sql.BigInt, BigInt(lastSessionId || '0'))
    .input('batchSize', sql.Int, batchSize)
    .query<DrawerSessionSqlRow>(`
      SELECT TOP (@batchSize)
        DRW_ID,
        CAST(DRW_SESSION_ID AS VARCHAR(30)) AS SESSION_ID,
        STR_ID,
        OPEN_DT,
        CLOSE_DT,
        USR_ID,
        0 AS TOT_SAL,
        0 AS TOT_TAX,
        0 AS SAL_TKT_CNT
      FROM dbo.PS_DRW_SESSION_HIST WITH (NOLOCK)
      WHERE DRW_SESSION_ID > @lastSessionId
      ORDER BY DRW_SESSION_ID ASC;
    `);

  return result.recordset;
}

/**
 * Fetch Open A/R items (AR_OPN_ITEM) for corporate customers
 */
export async function fetchOpenItems(
  lastDocNo: string = '',
  batchSize: number = 2500
): Promise<OpenItemSqlRow[]> {
  const pool = await getSqlPool();

  const result = await pool
    .request()
    .input('lastDocNo', sql.VarChar(30), lastDocNo)
    .input('batchSize', sql.Int, batchSize)
    .query<OpenItemSqlRow>(`
      SELECT TOP (@batchSize)
        CUST_NO,
        DOC_NO,
        DOC_DAT,
        DOC_TYP,
        ISNULL(AMT, 0) AS AMT,
        ISNULL(AMT, 0) AS BAL,
        TERMS_COD,
        DUE_DAT
      FROM dbo.AR_OPN_ITEM WITH (NOLOCK)
      WHERE DOC_NO > @lastDocNo
      ORDER BY DOC_NO ASC;
    `);

  return result.recordset;
}
