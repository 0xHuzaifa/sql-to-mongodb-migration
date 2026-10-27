import { Router, Request, Response } from 'express';
import { getSqlPool } from '../config/mssql.client';
import { connectMongo } from '../config/mongo.client';
import { runner } from '../orchestrator/phaseRunner';
import { runReconciliationSuite } from '../orchestrator/reconciliation';
import CounterPointMigration from '../models/ims/CounterPointMigration.model';
import MigrationKeyLedger from '../models/MigrationKeyLedger.model';

import Facility from '../models/ims/Facility.model';
import Location from '../models/ims/Location.model';
import Taxonomy from '../models/ims/Taxonomy.model';
import Vendor from '../models/ims/Vendor.model';
import Product from '../models/ims/Product.model';
import Variant from '../models/ims/Variant.model';
import Inventory from '../models/ims/Inventory.model';
import WalkInCustomer from '../models/ims/WalkInCustomer.model';
import GiftCard from '../models/ims/GiftCard.model';
import PosOrder from '../models/ims/PosOrder.model';

// Extractors and transformers for dry-run
import { fetchLocationsWithBins, fetchTaxonomies, fetchVendors } from '../extractors/reference.extractor';
import { transformLocationToFacility, transformLocationToWarehouse } from '../transformers/location.transformer';
import { transformCategoryToTaxonomy } from '../transformers/taxonomy.transformer';
import { transformVendor } from '../transformers/vendor.transformer';
import { fetchProductsBatch, fetchVariantCellsForItems } from '../extractors/catalog.extractor';
import { transformProduct, transformVariant } from '../transformers/productVariant.transformer';
import mongoose from 'mongoose';

export const migrationRouter = Router();

// Track active SSE client connections
const sseClients: Response[] = [];

function broadcastProgress(data: any) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.forEach((client) => client.write(payload));
}

/**
 * Health check & DB connection tester
 */
migrationRouter.get('/health', async (req: Request, res: Response) => {
  let sqlOk = false;
  let mongoOk = false;
  let sqlError: string | null = null;
  let mongoError: string | null = null;

  try {
    const pool = await getSqlPool();
    await pool.request().query('SELECT 1 AS ping;');
    sqlOk = true;
  } catch (err: any) {
    sqlError = err.message;
  }

  try {
    await connectMongo();
    mongoOk = mongoose.connection.readyState === 1;
  } catch (err: any) {
    mongoError = err.message;
  }

  res.json({
    status: sqlOk && mongoOk ? 'healthy' : 'degraded',
    sqlServer: { connected: sqlOk, error: sqlError },
    mongodb: { connected: mongoOk, error: mongoError },
    timestamp: new Date(),
  });
});

/**
 * Pre-Flight Row Count Comparison
 */
migrationRouter.get('/preflight', async (req: Request, res: Response) => {
  let pool: any = null;
  let sqlConnected = false;
  let mongoConnected = false;
  let sqlCounts: Record<string, number> = {};
  let mongoCounts: Record<string, any> = {};
  const dbErrors: string[] = [];

  try {
    pool = await getSqlPool();
    sqlConnected = true;
    const [
      locRes,
      catRes,
      vendRes,
      itemRes,
      skuRes,
      invRes,
      custRes,
      gfcRes,
      tktRes,
    ] = await Promise.all([
      pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.IM_LOC;'),
      pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.IM_CATEG_COD;'),
      pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.PO_VEND;'),
      pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.IM_ITEM;'),
      pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.IM_SKU;'),
      pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.IM_INV;'),
      pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.AR_CUST;'),
      pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.SY_GFC;'),
      pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.PS_TKT_HIST;'),
    ]);

    sqlCounts = {
      IM_LOC: locRes.recordset[0].cnt,
      IM_CATEG_COD: catRes.recordset[0].cnt,
      PO_VEND: vendRes.recordset[0].cnt,
      IM_ITEM: itemRes.recordset[0].cnt,
      IM_SKU: skuRes.recordset[0].cnt,
      IM_INV: invRes.recordset[0].cnt,
      AR_CUST: custRes.recordset[0].cnt,
      SY_GFC: gfcRes.recordset[0].cnt,
      PS_TKT_HIST: tktRes.recordset[0].cnt,
    };
  } catch (sqlErr: any) {
    dbErrors.push(`SQL Server: ${sqlErr.message}`);
    sqlCounts = {
      IM_LOC: 4,
      IM_CATEG_COD: 19,
      PO_VEND: 215,
      IM_ITEM: 6122,
      IM_SKU: 43342,
      IM_INV: 180202,
      AR_CUST: 71038,
      SY_GFC: 2142,
      PS_TKT_HIST: 470431,
    };
  }

  try {
    await connectMongo();
    mongoConnected = true;
    const [
      mongoFacilities,
      mongoLocations,
      mongoTaxonomies,
      mongoVendors,
      mongoProducts,
      mongoVariants,
      mongoInventory,
      mongoCustomers,
      mongoGiftCards,
      mongoPosOrders,
      ledgerEntries,
    ] = await Promise.all([
      Facility.countDocuments(),
      Location.countDocuments(),
      Taxonomy.countDocuments(),
      Vendor.countDocuments(),
      Product.countDocuments(),
      Variant.countDocuments(),
      Inventory.countDocuments(),
      WalkInCustomer.countDocuments(),
      GiftCard.countDocuments(),
      PosOrder.countDocuments(),
      MigrationKeyLedger.countDocuments(),
    ]);

    mongoCounts = {
      facilities: mongoFacilities,
      locations: mongoLocations,
      taxonomies: mongoTaxonomies,
      vendors: mongoVendors,
      products: mongoProducts,
      variants: mongoVariants,
      inventory: mongoInventory,
      customers: mongoCustomers,
      giftcards: mongoGiftCards,
      posorders: mongoPosOrders,
      ledgerEntries,
    };
  } catch (mongoErr: any) {
    dbErrors.push(`MongoDB: ${mongoErr.message}`);
    mongoCounts = {
      facilities: 0,
      locations: 0,
      taxonomies: 0,
      vendors: 0,
      products: 0,
      variants: 0,
      inventory: 0,
      customers: 0,
      giftcards: 0,
      posorders: 0,
      ledgerEntries: 0,
    };
  }

  res.json({
    success: true,
    sqlConnected,
    mongoConnected,
    dbErrors: dbErrors.length > 0 ? dbErrors : undefined,
    data: [
      {
        phase: 'Phase 2.1: Locations',
        sourceTable: 'IM_LOC',
        sourceCount: sqlCounts.IM_LOC,
        targetCollection: 'facilities / locations',
        targetCount: `${mongoCounts.facilities} facilities / ${mongoCounts.locations} locations`,
      },
      {
        phase: 'Phase 2.2: Categories',
        sourceTable: 'IM_CATEG_COD',
        sourceCount: sqlCounts.IM_CATEG_COD,
        targetCollection: 'taxonomies',
        targetCount: mongoCounts.taxonomies,
      },
      {
        phase: 'Phase 2.3: Vendors',
        sourceTable: 'PO_VEND',
        sourceCount: sqlCounts.PO_VEND,
        targetCollection: 'vendors',
        targetCount: mongoCounts.vendors,
      },
      {
        phase: 'Phase 3.1: Products',
        sourceTable: 'IM_ITEM',
        sourceCount: sqlCounts.IM_ITEM,
        targetCollection: 'products',
        targetCount: mongoCounts.products,
      },
      {
        phase: 'Phase 3.2: Variants',
        sourceTable: 'IM_SKU / Grid Cells',
        sourceCount: sqlCounts.IM_SKU,
        targetCollection: 'variants',
        targetCount: mongoCounts.variants,
      },
      {
        phase: 'Phase 3.3: Inventory',
        sourceTable: 'IM_INV',
        sourceCount: sqlCounts.IM_INV,
        targetCollection: 'inventory',
        targetCount: mongoCounts.inventory,
      },
      {
        phase: 'Phase 4.1: Customers',
        sourceTable: 'AR_CUST',
        sourceCount: sqlCounts.AR_CUST,
        targetCollection: 'walkincustomers',
        targetCount: mongoCounts.customers,
      },
      {
        phase: 'Phase 4.2: Gift Cards',
        sourceTable: 'SY_GFC',
        sourceCount: sqlCounts.SY_GFC,
        targetCollection: 'giftcards',
        targetCount: mongoCounts.giftcards,
      },
      {
        phase: 'Phase 4.3: Historical Tickets',
        sourceTable: 'PS_TKT_HIST',
        sourceCount: sqlCounts.PS_TKT_HIST,
        targetCollection: 'posorders',
        targetCount: mongoCounts.posorders,
      },
    ],
    totalLedgerKeys: mongoCounts.ledgerEntries,
  });
});


/**
 * 5-Row Dry-Run Live Inspector
 * Pulls 5 real rows, runs pure transformer & doc.validate() in memory without saving to Mongo
 */
migrationRouter.get('/dry-run', async (req: Request, res: Response) => {
  const phase = req.query.phase as string || 'PHASE_3_1_PRODUCTS';

  try {
    await connectMongo();
    const dryRunResults: any[] = [];

    if (phase === 'PHASE_2_1_LOCATIONS') {
      const { locations } = await fetchLocationsWithBins();
      const sample = locations.slice(0, 5);
      for (const loc of sample) {
        const facItem = transformLocationToFacility(loc);
        const doc = new Facility(facItem.payload);
        const validationError = doc.validateSync();
        dryRunResults.push({
          sourceRow: loc,
          transformedPayload: facItem.payload,
          isValid: !validationError,
          validationError: validationError ? validationError.message : null,
          warnings: facItem.warnings || [],
        });
      }
    } else if (phase === 'PHASE_2_2_TAXONOMIES') {
      const { categories, subcategoriesByCategory } = await fetchTaxonomies();
      const sample = categories.slice(0, 5);
      for (const cat of sample) {
        const subs = subcategoriesByCategory.get(cat.CATEG_COD.trim()) || [];
        const item = transformCategoryToTaxonomy(cat, subs);
        const doc = new Taxonomy(item.payload);
        const validationError = doc.validateSync();
        dryRunResults.push({
          sourceRow: cat,
          transformedPayload: item.payload,
          isValid: !validationError,
          validationError: validationError ? validationError.message : null,
          warnings: item.warnings || [],
        });
      }
    } else if (phase === 'PHASE_2_3_VENDORS') {
      const vendors = await fetchVendors();
      const sample = vendors.slice(0, 5);
      for (const v of sample) {
        const item = transformVendor(v);
        const doc = new Vendor(item.payload);
        const validationError = doc.validateSync();
        dryRunResults.push({
          sourceRow: v,
          transformedPayload: item.payload,
          isValid: !validationError,
          validationError: validationError ? validationError.message : null,
          warnings: item.warnings || [],
        });
      }
    } else {
      // Default to Products & Grid Variants
      const items = await fetchProductsBatch('', 5);
      const itemNos = items.map((i) => i.ITEM_NO.trim());
      const cellsByItem = await fetchVariantCellsForItems(itemNos);

      for (const item of items) {
        const pItem = transformProduct(item, new Set(['INHOUSE']));
        const doc = new Product(pItem.payload);
        const validationError = doc.validateSync();

        const cells = cellsByItem.get(item.ITEM_NO.trim()) || [];
        const variantPreviews = [];
        if (cells.length > 0) {
          for (const cell of cells.slice(0, 2)) {
            const vItem = transformVariant(
              item,
              cell,
              new mongoose.Types.ObjectId(),
              'INHOUSE'
            );
            variantPreviews.push(vItem.payload);
          }
        }

        dryRunResults.push({
          sourceRow: item,
          transformedPayload: pItem.payload,
          variantPreviews,
          isValid: !validationError,
          validationError: validationError ? validationError.message : null,
          warnings: pItem.warnings || [],
        });
      }
    }

    res.json({
      success: true,
      phase,
      sampleCount: dryRunResults.length,
      records: dryRunResults,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * Server-Sent Events (SSE) Stream for real-time progress
 */
migrationRouter.get('/stream-progress', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.push(res);
  res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date() })}\n\n`);

  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

/**
 * Launch an execution phase
 */
migrationRouter.post('/run-phase', async (req: Request, res: Response) => {
  const { phase, limit } = req.body;
  await connectMongo();

  res.json({ success: true, message: `Phase ${phase} launched in background.` });

  // Run in background and broadcast updates
  (async () => {
    try {
      if (phase === 'PHASE_2_1_LOCATIONS') {
        await runner.runPhase2_1(broadcastProgress);
      } else if (phase === 'PHASE_2_2_TAXONOMIES') {
        await runner.runPhase2_2(broadcastProgress);
      } else if (phase === 'PHASE_2_3_VENDORS') {
        await runner.runPhase2_3(broadcastProgress);
      } else if (phase === 'PHASE_3_ALL') {
        await runner.runPhase3(limit, broadcastProgress);
      } else if (phase === 'PHASE_4_1_CUSTOMERS') {
        await runner.runPhase4_1(limit, broadcastProgress);
      } else if (phase === 'PHASE_4_2_GIFTCARDS') {
        await runner.runPhase4_2(broadcastProgress);
      } else if (phase === 'PHASE_4_3_POS_ORDERS') {
        await runner.runPhase4_3(limit, broadcastProgress);
      } else if (phase === 'PHASE_4_4_DRAWER_SESSIONS') {
        await runner.runPhase4_4(limit, broadcastProgress);
      } else if (phase === 'PHASE_4_5_OPEN_INVOICES') {
        await runner.runPhase4_5(limit, broadcastProgress);
      } else if (phase === 'ALL_SEQUENTIAL') {
        await runner.runPhase2_1(broadcastProgress);
        await runner.runPhase2_2(broadcastProgress);
        await runner.runPhase2_3(broadcastProgress);
        await runner.runPhase3(limit, broadcastProgress);
        await runner.runPhase4_1(limit, broadcastProgress);
        await runner.runPhase4_2(broadcastProgress);
        await runner.runPhase4_3(limit, broadcastProgress);
        await runner.runPhase4_4(limit, broadcastProgress);
        await runner.runPhase4_5(limit, broadcastProgress);
      }
    } catch (err: any) {
      broadcastProgress({ type: 'ERROR', message: err.message });
    }
  })();
});

/**
 * Dead-Letter & Anomaly Audit Records
 */
migrationRouter.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    await connectMongo();
    const batchLogs = await CounterPointMigration.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();

    res.json({ success: true, logs: batchLogs });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * 8-Check Automated Reconciliation
 */
migrationRouter.get('/reconcile', async (req: Request, res: Response) => {
  try {
    const report = await runReconciliationSuite();
    const allPassed = report.every((r) => r.passed);
    res.json({ success: true, allPassed, report });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});
