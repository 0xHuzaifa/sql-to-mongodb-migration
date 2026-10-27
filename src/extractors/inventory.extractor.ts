import sql from 'mssql';
import { getSqlPool } from '../config/mssql.client';

export interface HeaderStockSqlRow {
  ITEM_NO: string;
  LOC_ID: string;
  BIN_1: string | null;
  QTY_ON_HND: number;
  QTY_COMMIT: number;
  QTY_ON_PO: number;
  QTY_ON_BO: number;
  MIN_QTY: number;
  MAX_QTY: number;
  LST_COST: number;
}

export interface CellStockSqlRow {
  ITEM_NO: string;
  LOC_ID: string;
  DIM_1_UPR: string;
  DIM_2_UPR: string;
  DIM_3_UPR: string;
  QTY_ON_HND: number;
  QTY_COMMIT: number;
  QTY_ON_PO: number;
  QTY_ON_BO: number;
  MIN_QTY: number;
  MAX_QTY: number;
}

/**
 * Fetch header stock (IM_INV) for a list of ITEM_NOs
 */
export async function fetchHeaderStock(itemNos: string[]): Promise<Map<string, HeaderStockSqlRow[]>> {
  if (itemNos.length === 0) return new Map();
  const pool = await getSqlPool();

  const request = pool.request();
  const paramNames = itemNos.map((_, i) => `@item_${i}`);
  itemNos.forEach((no, i) => request.input(`item_${i}`, sql.VarChar(20), no));

  const result = await request.query<HeaderStockSqlRow>(`
    SELECT 
      ITEM_NO, LOC_ID, BIN_1,
      QTY_ON_HND, QTY_COMMIT, QTY_ON_PO, QTY_ON_BO,
      MIN_QTY, MAX_QTY, LST_COST
    FROM dbo.IM_INV WITH (NOLOCK)
    WHERE ITEM_NO IN (${paramNames.join(',')});
  `);

  const stockByItem = new Map<string, HeaderStockSqlRow[]>();
  for (const s of result.recordset) {
    const itemNo = s.ITEM_NO.trim();
    if (!stockByItem.has(itemNo)) stockByItem.set(itemNo, []);
    stockByItem.get(itemNo)!.push({
      ...s,
      ITEM_NO: itemNo,
      LOC_ID: s.LOC_ID.trim(),
      BIN_1: s.BIN_1 ? s.BIN_1.trim() : null,
      QTY_ON_HND: Number(s.QTY_ON_HND) || 0,
      QTY_COMMIT: Number(s.QTY_COMMIT) || 0,
      QTY_ON_PO: Number(s.QTY_ON_PO) || 0,
      QTY_ON_BO: Number(s.QTY_ON_BO) || 0,
      MIN_QTY: Number(s.MIN_QTY) || 0,
      MAX_QTY: Number(s.MAX_QTY) || 0,
      LST_COST: Number(s.LST_COST) || 0,
    });
  }

  return stockByItem;
}

/**
 * Fetch cell stock (IM_INV_CELL) for a list of ITEM_NOs
 */
export async function fetchCellStock(itemNos: string[]): Promise<Map<string, CellStockSqlRow[]>> {
  if (itemNos.length === 0) return new Map();
  const pool = await getSqlPool();

  const request = pool.request();
  const paramNames = itemNos.map((_, i) => `@item_${i}`);
  itemNos.forEach((no, i) => request.input(`item_${i}`, sql.VarChar(20), no));

  const result = await request.query<CellStockSqlRow>(`
    SELECT 
      ITEM_NO, LOC_ID, DIM_1_UPR, DIM_2_UPR, DIM_3_UPR,
      QTY_ON_HND, QTY_COMMIT, QTY_ON_PO, QTY_ON_BO,
      MIN_QTY, MAX_QTY
    FROM dbo.IM_INV_CELL WITH (NOLOCK)
    WHERE ITEM_NO IN (${paramNames.join(',')});
  `);

  const stockByCellKey = new Map<string, CellStockSqlRow[]>();
  for (const s of result.recordset) {
    const cellKey = `${s.ITEM_NO.trim()}|${s.DIM_1_UPR.trim()}|${s.DIM_2_UPR.trim()}|${s.DIM_3_UPR.trim()}`;
    if (!stockByCellKey.has(cellKey)) stockByCellKey.set(cellKey, []);
    stockByCellKey.get(cellKey)!.push({
      ...s,
      ITEM_NO: s.ITEM_NO.trim(),
      LOC_ID: s.LOC_ID.trim(),
      DIM_1_UPR: s.DIM_1_UPR.trim(),
      DIM_2_UPR: s.DIM_2_UPR.trim(),
      DIM_3_UPR: s.DIM_3_UPR.trim(),
      QTY_ON_HND: Number(s.QTY_ON_HND) || 0,
      QTY_COMMIT: Number(s.QTY_COMMIT) || 0,
      QTY_ON_PO: Number(s.QTY_ON_PO) || 0,
      QTY_ON_BO: Number(s.QTY_ON_BO) || 0,
      MIN_QTY: Number(s.MIN_QTY) || 0,
      MAX_QTY: Number(s.MAX_QTY) || 0,
    });
  }

  return stockByCellKey;
}
