import sql from 'mssql';
import { getSqlPool } from '../config/mssql.client';

export interface ItemSqlRow {
  ITEM_NO: string;
  DESCR: string;
  LONG_DESCR: string | null;
  SHORT_DESCR: string | null;
  ADDL_DESCR_1: string | null;
  ADDL_DESCR_2: string | null;
  ADDL_DESCR_3: string | null;
  ITEM_TYP: string;
  CATEG_COD: string | null;
  SUBCAT_COD: string | null;
  ATTR_COD_1: string | null;
  TRK_METH: string;
  STAT: string;
  IS_TXBL: string;
  ITEM_VEND_NO: string | null;
  WARR_PRD_1: number | null;
  WARR_PRD_2: number | null;
  BARCOD: string | null;
  PRC_1: number;
  REG_PRC: number | null;
  LST_COST: number | null;
  IS_DISCNTBL: string;
  TAX_CATEG_COD: string | null;
  GRID_DIM_1_TAG: string | null;
  GRID_DIM_2_TAG: string | null;
  GRID_DIM_3_TAG: string | null;
}

export interface VariantCellSqlRow {
  ITEM_NO: string;
  DIM_1_UPR: string;
  DIM_2_UPR: string;
  DIM_3_UPR: string;
  DISPLAY_DIM_1: string | null;
  DISPLAY_DIM_2: string | null;
  DISPLAY_DIM_3: string | null;
}

export interface BarcodeSqlRow {
  ITEM_NO: string;
  DIM_1_UPR: string;
  DIM_2_UPR: string;
  DIM_3_UPR: string;
  BARCOD: string;
  SEQ_NO: number;
}

export interface PriceSqlRow {
  ITEM_NO: string;
  LOC_ID: string;
  DIM_1_UPR: string;
  DIM_2_UPR: string;
  DIM_3_UPR: string;
  PRC_1: number | null;
  PRC_2: number | null;
  PRC_3: number | null;
  PRC_4: number | null;
  REG_PRC: number | null;
}

/**
 * Fetch a paged batch of products from IM_ITEM
 */
export async function fetchProductsBatch(
  lastItemNo: string = '',
  batchSize: number = 1000
): Promise<ItemSqlRow[]> {
  const pool = await getSqlPool();

  const result = await pool
    .request()
    .input('lastItemNo', sql.VarChar(20), lastItemNo)
    .input('batchSize', sql.Int, batchSize)
    .query<ItemSqlRow>(`
      SELECT TOP (@batchSize)
        ITEM_NO, DESCR, LONG_DESCR, SHORT_DESCR,
        ADDL_DESCR_1, ADDL_DESCR_2, ADDL_DESCR_3,
        ITEM_TYP, CATEG_COD, SUBCAT_COD, ATTR_COD_1,
        TRK_METH, STAT, IS_TXBL, ITEM_VEND_NO,
        WARR_PRD_1, WARR_PRD_2, BARCOD, PRC_1, REG_PRC,
        LST_COST, IS_DISCNTBL, TAX_CATEG_COD,
        GRID_DIM_1_TAG, GRID_DIM_2_TAG, GRID_DIM_3_TAG
      FROM dbo.IM_ITEM WITH (NOLOCK)
      WHERE ITEM_NO > @lastItemNo
      ORDER BY ITEM_NO ASC;
    `);

  return result.recordset;
}

/**
 * Fetch all active variant dimension cells for a list of ITEM_NOs
 */
export async function fetchVariantCellsForItems(
  itemNos: string[]
): Promise<Map<string, VariantCellSqlRow[]>> {
  if (itemNos.length === 0) return new Map();
  const pool = await getSqlPool();

  // Create temporary in-memory TVP or parametrized list
  const request = pool.request();
  const paramNames = itemNos.map((_, i) => `@item_${i}`);
  itemNos.forEach((no, i) => request.input(`item_${i}`, sql.VarChar(20), no));

  const query = `
    SELECT DISTINCT 
      c.ITEM_NO,
      c.DIM_1_UPR,
      c.DIM_2_UPR,
      c.DIM_3_UPR,
      d1.DIM_1 AS DISPLAY_DIM_1,
      d2.DIM_2 AS DISPLAY_DIM_2,
      d3.DIM_3 AS DISPLAY_DIM_3
    FROM (
      SELECT ITEM_NO, DIM_1_UPR, DIM_2_UPR, DIM_3_UPR FROM dbo.IM_INV_CELL WITH (NOLOCK)
      WHERE ITEM_NO IN (${paramNames.join(',')})
      UNION
      SELECT ITEM_NO, DIM_1_UPR, DIM_2_UPR, DIM_3_UPR FROM dbo.IM_BARCOD WITH (NOLOCK)
      WHERE (DIM_1_UPR <> '*' OR DIM_2_UPR <> '*' OR DIM_3_UPR <> '*')
        AND ITEM_NO IN (${paramNames.join(',')})
      UNION
      SELECT ITEM_NO, UPPER(ISNULL(DIM_1, '*')), UPPER(ISNULL(DIM_2, '*')), UPPER(ISNULL(DIM_3, '*')) 
      FROM dbo.IM_SKU WITH (NOLOCK)
      WHERE ITEM_NO IN (${paramNames.join(',')})
    ) c
    LEFT JOIN dbo.IM_GRID_DIM_1 d1 WITH (NOLOCK) ON c.ITEM_NO = d1.ITEM_NO AND c.DIM_1_UPR = d1.DIM_1_UPR
    LEFT JOIN dbo.IM_GRID_DIM_2 d2 WITH (NOLOCK) ON c.ITEM_NO = d2.ITEM_NO AND c.DIM_2_UPR = d2.DIM_2_UPR
    LEFT JOIN dbo.IM_GRID_DIM_3 d3 WITH (NOLOCK) ON c.ITEM_NO = d3.ITEM_NO AND c.DIM_3_UPR = d3.DIM_3_UPR;
  `;

  const result = await request.query<VariantCellSqlRow>(query);
  const cellsByItemNo = new Map<string, VariantCellSqlRow[]>();

  for (const row of result.recordset) {
    const itemNo = row.ITEM_NO.trim();
    if (!cellsByItemNo.has(itemNo)) cellsByItemNo.set(itemNo, []);
    cellsByItemNo.get(itemNo)!.push({
      ...row,
      ITEM_NO: itemNo,
      DIM_1_UPR: row.DIM_1_UPR.trim(),
      DIM_2_UPR: row.DIM_2_UPR.trim(),
      DIM_3_UPR: row.DIM_3_UPR.trim(),
      DISPLAY_DIM_1: row.DISPLAY_DIM_1 ? row.DISPLAY_DIM_1.trim() : null,
      DISPLAY_DIM_2: row.DISPLAY_DIM_2 ? row.DISPLAY_DIM_2.trim() : null,
      DISPLAY_DIM_3: row.DISPLAY_DIM_3 ? row.DISPLAY_DIM_3.trim() : null,
    });
  }

  return cellsByItemNo;
}

/**
 * Fetch barcodes for a list of ITEM_NOs
 */
export async function fetchBarcodesForItems(
  itemNos: string[]
): Promise<Map<string, BarcodeSqlRow[]>> {
  if (itemNos.length === 0) return new Map();
  const pool = await getSqlPool();

  const request = pool.request();
  const paramNames = itemNos.map((_, i) => `@item_${i}`);
  itemNos.forEach((no, i) => request.input(`item_${i}`, sql.VarChar(20), no));

  const result = await request.query<BarcodeSqlRow>(`
    SELECT ITEM_NO, DIM_1_UPR, DIM_2_UPR, DIM_3_UPR, BARCOD, SEQ_NO
    FROM dbo.IM_BARCOD WITH (NOLOCK)
    WHERE ITEM_NO IN (${paramNames.join(',')})
    ORDER BY ITEM_NO ASC, SEQ_NO ASC;
  `);

  const barcodesByCellKey = new Map<string, BarcodeSqlRow[]>();
  for (const b of result.recordset) {
    const key = `${b.ITEM_NO.trim()}|${b.DIM_1_UPR.trim()}|${b.DIM_2_UPR.trim()}|${b.DIM_3_UPR.trim()}`;
    if (!barcodesByCellKey.has(key)) barcodesByCellKey.set(key, []);
    barcodesByCellKey.get(key)!.push({
      ...b,
      ITEM_NO: b.ITEM_NO.trim(),
      DIM_1_UPR: b.DIM_1_UPR.trim(),
      DIM_2_UPR: b.DIM_2_UPR.trim(),
      DIM_3_UPR: b.DIM_3_UPR.trim(),
      BARCOD: b.BARCOD.trim(),
    });
  }

  return barcodesByCellKey;
}

/**
 * Fetch prices from IM_PRC for a list of ITEM_NOs
 */
export async function fetchPricesForItems(
  itemNos: string[]
): Promise<Map<string, PriceSqlRow[]>> {
  if (itemNos.length === 0) return new Map();
  const pool = await getSqlPool();

  const request = pool.request();
  const paramNames = itemNos.map((_, i) => `@item_${i}`);
  itemNos.forEach((no, i) => request.input(`item_${i}`, sql.VarChar(20), no));

  const result = await request.query<PriceSqlRow>(`
    SELECT ITEM_NO, LOC_ID, DIM_1_UPR, DIM_2_UPR, DIM_3_UPR, PRC_1, PRC_2, PRC_3, PRC_4, REG_PRC
    FROM dbo.IM_PRC WITH (NOLOCK)
    WHERE ITEM_NO IN (${paramNames.join(',')});
  `);

  const pricesByCellKey = new Map<string, PriceSqlRow[]>();
  for (const p of result.recordset) {
    const key = `${p.ITEM_NO.trim()}|${p.DIM_1_UPR.trim()}|${p.DIM_2_UPR.trim()}|${p.DIM_3_UPR.trim()}`;
    if (!pricesByCellKey.has(key)) pricesByCellKey.set(key, []);
    pricesByCellKey.get(key)!.push(p);
  }

  return pricesByCellKey;
}
