import sql from 'mssql';
import { getSqlPool } from '../config/mssql.client';

export interface CustomerSqlRow {
  CUST_NO: string;
  NAM: string;
  FST_NAM: string | null;
  LST_NAM: string | null;
  CUST_TYP: string;
  ADRS_1: string | null;
  ADRS_2: string | null;
  CITY: string | null;
  STATE: string | null;
  ZIP_COD: string | null;
  PHONE_1: string | null;
  PHONE_2: string | null;
  MBL_PHONE_1: string | null;
  MBL_PHONE_2: string | null;
  EMAIL_ADRS_1: string | null;
  CATEG_COD: string | null;
  USER_PARENT_CUST_NO: string | null;
  DISC_PCT: number | null;
  TAX_EXEMPT_NO: string | null;
  TAX_COD: string | null;
  CR_LIM: number | null;
  BAL: number | null;
}

export interface GiftCardSqlRow {
  GFC_NO: string;
  ORIG_AMT: number;
  CURR_AMT: number;
  IS_VOID: string;
  ORIG_DAT: Date | null;
  ORIG_DOC_NO: string | null;
}

export interface GiftCardActivitySqlRow {
  GFC_NO: string;
  SEQ_NO: number;
  ACTIV_DAT: Date;
  ACTIV_TYP: string;
  AMT: number;
  DOC_NO: string | null;
  USR_ID: string | null;
  COMMNT: string | null;
}

/**
 * Fetch distinct Parent Corporate Accounts (Pass 1)
 */
export async function fetchParentAccounts(): Promise<CustomerSqlRow[]> {
  const pool = await getSqlPool();

  const result = await pool.request().query<CustomerSqlRow>(`
    SELECT p.*
    FROM dbo.AR_CUST p WITH (NOLOCK)
    WHERE p.CUST_NO IN (
      SELECT DISTINCT USER_PARENT_CUST_NO 
      FROM dbo.AR_CUST WITH (NOLOCK)
      WHERE USER_PARENT_CUST_NO IS NOT NULL AND LTRIM(RTRIM(USER_PARENT_CUST_NO)) <> ''
    );
  `);

  return result.recordset;
}

/**
 * Fetch a paged batch of customers from AR_CUST (Pass 2)
 */
export async function fetchCustomersBatch(
  lastCustNo: string = '',
  batchSize: number = 1000
): Promise<CustomerSqlRow[]> {
  const pool = await getSqlPool();

  const result = await pool
    .request()
    .input('lastCustNo', sql.VarChar(20), lastCustNo)
    .input('batchSize', sql.Int, batchSize)
    .query<CustomerSqlRow>(`
      SELECT TOP (@batchSize)
        CUST_NO, NAM, FST_NAM, LST_NAM, CUST_TYP,
        ADRS_1, ADRS_2, CITY, STATE, ZIP_COD,
        PHONE_1, PHONE_2, MBL_PHONE_1, MBL_PHONE_2,
        EMAIL_ADRS_1, CATEG_COD, USER_PARENT_CUST_NO,
        DISC_PCT, TAX_EXEMPT_NO, TAX_COD, CR_LIM, BAL
      FROM dbo.AR_CUST WITH (NOLOCK)
      WHERE CUST_NO > @lastCustNo
      ORDER BY CUST_NO ASC;
    `);

  return result.recordset;
}

/**
 * Fetch Gift Cards and their activity history
 */
export async function fetchGiftCards(): Promise<{
  cards: GiftCardSqlRow[];
  activitiesByCardNo: Map<string, GiftCardActivitySqlRow[]>;
}> {
  const pool = await getSqlPool();

  const cardsResult = await pool.request().query<GiftCardSqlRow>(`
    SELECT GFC_NO, ORIG_AMT, CURR_AMT, IS_VOID, ORIG_DAT, ORIG_DOC_NO 
    FROM dbo.SY_GFC WITH (NOLOCK);
  `);

  const actResult = await pool.request().query<GiftCardActivitySqlRow>(`
    SELECT 
      GFC_NO, 
      SEQ_NO, 
      DAT AS ACTIV_DAT, 
      ACTIV_TYP, 
      AMT, 
      DOC_NO, 
      LST_MAINT_USR_ID AS USR_ID, 
      NULL AS COMMNT
    FROM dbo.SY_GFC_ACTIV WITH (NOLOCK)
    ORDER BY GFC_NO ASC, SEQ_NO ASC;
  `);

  const activitiesByCardNo = new Map<string, GiftCardActivitySqlRow[]>();
  for (const act of actResult.recordset) {
    const cardNo = act.GFC_NO.trim();
    if (!activitiesByCardNo.has(cardNo)) activitiesByCardNo.set(cardNo, []);
    activitiesByCardNo.get(cardNo)!.push({
      ...act,
      GFC_NO: cardNo,
      AMT: Number(act.AMT) || 0,
      DOC_NO: act.DOC_NO ? act.DOC_NO.trim() : null,
      USR_ID: act.USR_ID ? act.USR_ID.trim() : null,
      COMMNT: act.COMMNT ? act.COMMNT.trim() : null,
    });
  }

  return {
    cards: cardsResult.recordset,
    activitiesByCardNo,
  };
}
