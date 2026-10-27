import { getSqlPool } from '../config/mssql.client';

export interface LocationSqlRow {
  LOC_ID: string;
  DESCR: string;
  ADRS_1: string | null;
  ADRS_2: string | null;
  ADRS_3: string | null;
  CITY: string | null;
  STATE: string | null;
  ZIP_COD: string | null;
  CNTRY: string | null;
  PHONE_1: string | null;
  EMAIL_ADRS_1: string | null;
  CONTCT_1: string | null;
  RS_STAT: number;
}

export interface LocationBinSqlRow {
  LOC_ID: string;
  BIN_CODE: string;
}

export interface CategorySqlRow {
  CATEG_COD: string;
  DESCR: string;
}

export interface SubcategorySqlRow {
  CATEG_COD: string;
  SUBCAT_COD: string;
  SUBCAT_DESCR: string | null;
}

export interface VendorSqlRow {
  VEND_NO: string;
  NAM: string;
  EMAIL_ADRS_1: string | null;
  EMAIL_ADRS_2: string | null;
  PHONE_1: string | null;
  PHONE_2: string | null;
  CONTCT_1: string | null;
  CONTCT_2: string | null;
  RS_STAT: number;
  MAX_LEAD_DAYS: number;
}

export async function fetchLocationsWithBins(): Promise<{
  locations: LocationSqlRow[];
  binsByLocId: Map<string, string[]>;
}> {
  const pool = await getSqlPool();

  const locResult = await pool.request().query<LocationSqlRow>(`
    SELECT 
      l.LOC_ID, l.DESCR, l.ADRS_1, l.ADRS_2, l.ADRS_3,
      l.CITY, l.STATE, l.ZIP_COD, l.CNTRY,
      l.PHONE_1, l.EMAIL_ADRS_1, l.CONTCT_1, l.RS_STAT
    FROM dbo.IM_LOC l WITH (NOLOCK);
  `);

  const binResult = await pool.request().query<LocationBinSqlRow>(`
    SELECT DISTINCT LOC_ID, BIN_CODE
    FROM (
      SELECT LOC_ID, BIN_1 AS BIN_CODE FROM dbo.IM_INV WITH (NOLOCK) WHERE BIN_1 IS NOT NULL AND LTRIM(RTRIM(BIN_1)) <> ''
      UNION
      SELECT LOC_ID, BIN_2 AS BIN_CODE FROM dbo.IM_INV WITH (NOLOCK) WHERE BIN_2 IS NOT NULL AND LTRIM(RTRIM(BIN_2)) <> ''
      UNION
      SELECT LOC_ID, BIN_3 AS BIN_CODE FROM dbo.IM_INV WITH (NOLOCK) WHERE BIN_3 IS NOT NULL AND LTRIM(RTRIM(BIN_3)) <> ''
      UNION
      SELECT LOC_ID, BIN_4 AS BIN_CODE FROM dbo.IM_INV WITH (NOLOCK) WHERE BIN_4 IS NOT NULL AND LTRIM(RTRIM(BIN_4)) <> ''
    ) b;
  `);

  const binsByLocId = new Map<string, string[]>();
  for (const bin of binResult.recordset) {
    const locId = bin.LOC_ID.trim();
    if (!binsByLocId.has(locId)) binsByLocId.set(locId, []);
    binsByLocId.get(locId)!.push(bin.BIN_CODE.trim());
  }

  return {
    locations: locResult.recordset,
    binsByLocId,
  };
}

export async function fetchTaxonomies(): Promise<{
  categories: CategorySqlRow[];
  subcategoriesByCategory: Map<string, SubcategorySqlRow[]>;
}> {
  const pool = await getSqlPool();

  const catResult = await pool.request().query<CategorySqlRow>(`
    SELECT CATEG_COD, DESCR FROM dbo.IM_CATEG_COD WITH (NOLOCK);
  `);

  const subResult = await pool.request().query<SubcategorySqlRow>(`
    SELECT 
      COALESCE(s.CATEG_COD, i.CATEG_COD) AS CATEG_COD,
      COALESCE(s.SUBCAT_COD, i.SUBCAT_COD) AS SUBCAT_COD,
      MAX(COALESCE(s.DESCR, i.SUBCAT_COD)) AS SUBCAT_DESCR
    FROM dbo.IM_SUBCAT_COD s WITH (NOLOCK)
    FULL OUTER JOIN (
      SELECT DISTINCT CATEG_COD, SUBCAT_COD 
      FROM dbo.IM_ITEM WITH (NOLOCK)
      WHERE CATEG_COD IS NOT NULL AND SUBCAT_COD IS NOT NULL
    ) i ON s.CATEG_COD = i.CATEG_COD AND s.SUBCAT_COD = i.SUBCAT_COD
    WHERE COALESCE(s.CATEG_COD, i.CATEG_COD) IS NOT NULL
    GROUP BY COALESCE(s.CATEG_COD, i.CATEG_COD), COALESCE(s.SUBCAT_COD, i.SUBCAT_COD);
  `);

  const subcategoriesByCategory = new Map<string, SubcategorySqlRow[]>();
  for (const sub of subResult.recordset) {
    const cat = sub.CATEG_COD.trim();
    if (!subcategoriesByCategory.has(cat)) subcategoriesByCategory.set(cat, []);
    subcategoriesByCategory.get(cat)!.push({
      ...sub,
      CATEG_COD: cat,
      SUBCAT_COD: sub.SUBCAT_COD.trim(),
      SUBCAT_DESCR: sub.SUBCAT_DESCR ? sub.SUBCAT_DESCR.trim() : null,
    });
  }

  return {
    categories: catResult.recordset,
    subcategoriesByCategory,
  };
}

export async function fetchVendors(): Promise<VendorSqlRow[]> {
  const pool = await getSqlPool();

  const vendResult = await pool.request().query<VendorSqlRow>(`
    SELECT 
      v.VEND_NO, v.NAM, v.EMAIL_ADRS_1, v.EMAIL_ADRS_2,
      v.PHONE_1, v.PHONE_2, v.CONTCT_1, v.CONTCT_2,
      v.RS_STAT,
      ISNULL(MAX(vi.LEAD_DAYS), 7) AS MAX_LEAD_DAYS
    FROM dbo.PO_VEND v WITH (NOLOCK)
    LEFT JOIN dbo.PO_VEND_ITEM vi WITH (NOLOCK) ON v.VEND_NO = vi.VEND_NO
    GROUP BY 
      v.VEND_NO, v.NAM, v.EMAIL_ADRS_1, v.EMAIL_ADRS_2,
      v.PHONE_1, v.PHONE_2, v.CONTCT_1, v.CONTCT_2, v.RS_STAT;
  `);

  return vendResult.recordset;
}
