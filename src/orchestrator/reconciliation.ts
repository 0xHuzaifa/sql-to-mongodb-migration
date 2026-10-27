import { getSqlPool } from '../config/mssql.client';
import { connectMongo } from '../config/mongo.client';

import Facility from '../models/ims/Facility.model';
import Location from '../models/ims/Location.model';
import Taxonomy from '../models/ims/Taxonomy.model';
import Vendor from '../models/ims/Vendor.model';
import Product from '../models/ims/Product.model';
import InventoryLocation from '../models/ims/InventoryLocation.model';
import GiftCard from '../models/ims/GiftCard.model';
import WalkInCustomer from '../models/ims/WalkInCustomer.model';
import PosOrder from '../models/ims/PosOrder.model';
import MigrationKeyLedger from '../models/MigrationKeyLedger.model';

export interface ReconciliationReportItem {
  checkNumber: number;
  domain: string;
  sourceSqlCountOrSum: number;
  targetMongoCountOrSum: number;
  passed: boolean;
  notes: string;
}

export async function runReconciliationSuite(): Promise<ReconciliationReportItem[]> {
  await connectMongo();
  const pool = await getSqlPool();
  const report: ReconciliationReportItem[] = [];

  // Check 1: Locations
  const sqlLocRes = await pool.request().query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM dbo.IM_LOC;');
  const sqlLocCount = sqlLocRes.recordset[0].cnt;
  const mongoLocCount = await Location.countDocuments();
  report.push({
    checkNumber: 1,
    domain: 'Locations & Warehouses',
    sourceSqlCountOrSum: sqlLocCount,
    targetMongoCountOrSum: mongoLocCount,
    passed: mongoLocCount >= sqlLocCount,
    notes: `Expected ${sqlLocCount} locations. Mongo has ${mongoLocCount}.`,
  });

  // Check 2: Categories / Taxonomies
  const sqlCatRes = await pool.request().query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM dbo.IM_CATEG_COD;');
  const sqlCatCount = sqlCatRes.recordset[0].cnt;
  const mongoCatCount = await Taxonomy.countDocuments();
  report.push({
    checkNumber: 2,
    domain: 'Categories / Taxonomies',
    sourceSqlCountOrSum: sqlCatCount,
    targetMongoCountOrSum: mongoCatCount,
    passed: mongoCatCount >= sqlCatCount,
    notes: `Expected at least ${sqlCatCount} (+1 for UNCATEGORIZED). Mongo has ${mongoCatCount}.`,
  });

  // Check 3: Vendors
  const sqlVendRes = await pool.request().query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM dbo.PO_VEND;');
  const sqlVendCount = sqlVendRes.recordset[0].cnt;
  const mongoVendCount = await Vendor.countDocuments();
  report.push({
    checkNumber: 3,
    domain: 'Vendors',
    sourceSqlCountOrSum: sqlVendCount,
    targetMongoCountOrSum: mongoVendCount,
    passed: mongoVendCount >= sqlVendCount,
    notes: `Expected at least ${sqlVendCount} (+1 for INHOUSE). Mongo has ${mongoVendCount}.`,
  });

  // Check 4: Products
  const sqlProdRes = await pool.request().query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM dbo.IM_ITEM;');
  const sqlProdCount = sqlProdRes.recordset[0].cnt;
  const mongoProdCount = await Product.countDocuments();
  report.push({
    checkNumber: 4,
    domain: 'Parent Products',
    sourceSqlCountOrSum: sqlProdCount,
    targetMongoCountOrSum: mongoProdCount,
    passed: mongoProdCount === sqlProdCount,
    notes: `Expected exact match of ${sqlProdCount}. Mongo has ${mongoProdCount}.`,
  });

  // Check 5: Positive Physical Stock Sum (both non-gridded IM_INV and gridded IM_INV_CELL)
  const sqlStockRes = await pool.request().query<{ total: number }>(`
    SELECT 
      (SELECT ISNULL(SUM(inv.QTY_ON_HND), 0)
       FROM dbo.IM_INV inv
       JOIN dbo.IM_ITEM itm ON inv.ITEM_NO = itm.ITEM_NO
       WHERE inv.QTY_ON_HND > 0 AND itm.TRK_METH <> 'G') +
      (SELECT ISNULL(SUM(QTY_ON_HND), 0)
       FROM dbo.IM_INV_CELL
       WHERE QTY_ON_HND > 0) AS total;
  `);
  const sqlPositiveStock = Number(sqlStockRes.recordset[0].total) || 0;

  const mongoStockAgg = await InventoryLocation.aggregate([
    { $group: { _id: null, total: { $sum: '$quantity' } } },
  ]);
  const mongoStockSum = mongoStockAgg.length > 0 ? mongoStockAgg[0].total : 0;
  report.push({
    checkNumber: 5,
    domain: 'Positive Physical Stock Sum',
    sourceSqlCountOrSum: sqlPositiveStock,
    targetMongoCountOrSum: mongoStockSum,
    passed: Math.abs(sqlPositiveStock - mongoStockSum) < 1,
    notes: `SQL stock sum: ${sqlPositiveStock}. Mongo inventorylocations sum: ${mongoStockSum}.`,
  });

  // Check 6: Gift Cards
  const sqlGfcRes = await pool
    .request()
    .query<{ cnt: number; total: number }>(
      "SELECT COUNT(*) AS cnt, SUM(CURR_AMT) AS total FROM dbo.SY_GFC WHERE IS_VOID = 'N';"
    );
  const sqlGfcBalance = Number(sqlGfcRes.recordset[0].total) || 0;

  const mongoGfcAgg = await GiftCard.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: null, total: { $sum: '$currentBalance' } } },
  ]);
  const mongoGfcBalance = mongoGfcAgg.length > 0 ? mongoGfcAgg[0].total : 0;
  report.push({
    checkNumber: 6,
    domain: 'Active Gift Card Dollar Balance',
    sourceSqlCountOrSum: sqlGfcBalance,
    targetMongoCountOrSum: mongoGfcBalance,
    passed: Math.abs(sqlGfcBalance - mongoGfcBalance) < 0.01,
    notes: `SQL active balance: $${sqlGfcBalance.toFixed(2)}. Mongo balance: $${mongoGfcBalance.toFixed(2)}.`,
  });

  // Check 7: Customers Accounted For
  const sqlCustRes = await pool.request().query<{ cnt: number }>('SELECT COUNT(*) AS cnt FROM dbo.AR_CUST;');
  const sqlCustCount = sqlCustRes.recordset[0].cnt;
  const mongoLedgerCust = await MigrationKeyLedger.countDocuments({
    domain: /^AR_CUST/,
  });
  report.push({
    checkNumber: 7,
    domain: 'Customers Accounted For in Ledger',
    sourceSqlCountOrSum: sqlCustCount,
    targetMongoCountOrSum: mongoLedgerCust,
    passed: mongoLedgerCust >= sqlCustCount,
    notes: `Expected 100% of ${sqlCustCount} CUST_NOs mapped in ledger. Mapped: ${mongoLedgerCust}.`,
  });

  // Check 8: Historical POS Orders Revenue Match
  const sqlSalesRes = await pool
    .request()
    .query<{ cnt: number; total: number }>('SELECT COUNT(*) AS cnt, SUM(TOT) AS total FROM dbo.PS_TKT_HIST;');
  const sqlRevenue = Number(sqlSalesRes.recordset[0].total) || 0;

  const mongoSalesAgg = await PosOrder.aggregate([
    { $match: { localId: /^CP-/ } },
    { $group: { _id: null, count: { $sum: 1 }, revenue: { $sum: '$totalAmount' } } },
  ]);
  const mongoRevenue = mongoSalesAgg.length > 0 ? mongoSalesAgg[0].revenue : 0;
  report.push({
    checkNumber: 8,
    domain: 'Historical POS Tickets Revenue',
    sourceSqlCountOrSum: sqlRevenue,
    targetMongoCountOrSum: mongoRevenue,
    passed: Math.abs(sqlRevenue - mongoRevenue) < 1,
    notes: `SQL revenue: $${sqlRevenue.toFixed(2)}. Mongo revenue: $${mongoRevenue.toFixed(2)}.`,
  });

  return report;
}
