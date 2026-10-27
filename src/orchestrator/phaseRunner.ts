import mongoose from 'mongoose';
import { connectMongo } from '../config/mongo.client';
import { getSqlPool } from '../config/mssql.client';
import { ledgerCache } from '../cache/idLedgerCache';
import { validateAndBulkUpsert } from '../loaders/bulkLoader.service';

// Models
import Facility from '../models/ims/Facility.model';
import Location from '../models/ims/Location.model';
import Taxonomy from '../models/ims/Taxonomy.model';
import Vendor from '../models/ims/Vendor.model';
import Product from '../models/ims/Product.model';
import Variant from '../models/ims/Variant.model';
import Inventory from '../models/ims/Inventory.model';
import InventoryLocation from '../models/ims/InventoryLocation.model';
import WalkInCustomer from '../models/ims/WalkInCustomer.model';
import GiftCard from '../models/ims/GiftCard.model';
import PosOrder from '../models/ims/PosOrder.model';
import CounterPointReportArchive from '../models/ims/CounterPointReportArchive.model';
import Invoice from '../models/ims/Invoice.model';
import MigrationCheckpoint from '../models/MigrationCheckpoint.model';

// Extractors & Transformers
import {
  fetchLocationsWithBins,
  fetchTaxonomies,
  fetchVendors,
} from '../extractors/reference.extractor';
import {
  transformLocationToFacility,
  transformLocationToWarehouse,
} from '../transformers/location.transformer';
import {
  transformCategoryToTaxonomy,
  createUncategorizedTaxonomy,
} from '../transformers/taxonomy.transformer';
import {
  transformVendor,
  createInhouseVendor,
} from '../transformers/vendor.transformer';

import {
  fetchProductsBatch,
  fetchVariantCellsForItems,
  fetchBarcodesForItems,
  fetchPricesForItems,
} from '../extractors/catalog.extractor';
import {
  fetchHeaderStock,
  fetchCellStock,
} from '../extractors/inventory.extractor';
import {
  transformProduct,
  transformVariant,
} from '../transformers/productVariant.transformer';
import { transformInventory } from '../transformers/inventory.transformer';

import {
  fetchCustomersBatch,
  fetchGiftCards,
} from '../extractors/customer.extractor';
import {
  transformCustomerToWalkIn,
  transformGiftCard,
} from '../transformers/customer.transformer';

import { fetchNextTicketBatch } from '../extractors/sales.extractor';
import { transformPosOrder } from '../transformers/posOrder.transformer';

import { fetchDrawerSessions, fetchOpenItems } from '../extractors/reportsAndInvoices.extractor';
import {
  transformDrawerSessionToReportArchive,
  transformOpenItemToInvoice,
} from '../transformers/reportInvoice.transformer';

export type PhaseKey =
  | 'PHASE_2_1_LOCATIONS'
  | 'PHASE_2_2_TAXONOMIES'
  | 'PHASE_2_3_VENDORS'
  | 'PHASE_3_1_PRODUCTS'
  | 'PHASE_3_2_VARIANTS'
  | 'PHASE_3_3_INVENTORY'
  | 'PHASE_4_1_CUSTOMERS'
  | 'PHASE_4_2_GIFTCARDS'
  | 'PHASE_4_3_POS_ORDERS'
  | 'PHASE_4_4_DRAWER_SESSIONS'
  | 'PHASE_4_5_OPEN_INVOICES';

export interface PhaseProgress {
  phaseKey: PhaseKey;
  phaseName: string;
  processed: number;
  total: number;
  success: number;
  warnings: number;
  failed: number;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'paused';
  message?: string;
}

export type ProgressCallback = (progress: PhaseProgress) => void;

export class MigrationPhaseRunner {
  private batchId: string;
  private isPaused: boolean = false;

  constructor() {
    this.batchId = `MIG_${Date.now()}`;
  }

  public pause(): void {
    this.isPaused = true;
  }

  public resume(): void {
    this.isPaused = false;
  }

  /**
   * Phase 2.1: Facilities and Locations
   */
  async runPhase2_1(onProgress?: ProgressCallback): Promise<PhaseProgress> {
    const p: PhaseProgress = {
      phaseKey: 'PHASE_2_1_LOCATIONS',
      phaseName: 'Phase 2.1: Locations & Facilities',
      processed: 0,
      total: 0,
      success: 0,
      warnings: 0,
      failed: 0,
      status: 'running',
    };
    onProgress?.(p);

    try {
      const { locations, binsByLocId } = await fetchLocationsWithBins();
      p.total = locations.length;

      const facilityItems = [];
      const locationItems = [];

      for (const loc of locations) {
        const locId = loc.LOC_ID.trim();
        const distinctBins = binsByLocId.get(locId) || [];

        // Seed Facility
        const facItem = transformLocationToFacility(loc);
        const { objectId: facId } = ledgerCache.getOrCreateObjectId('IM_LOC_FACILITY', locId);
        (facItem.payload as any)._id = facId;
        facilityItems.push(facItem);

        // Seed Location
        const locItem = transformLocationToWarehouse(loc, distinctBins);
        const { objectId: locObjId } = ledgerCache.getOrCreateObjectId('IM_LOC_LOCATION', locId);
        (locItem.payload as any)._id = locObjId;
        locationItems.push(locItem);
      }

      const res1 = await validateAndBulkUpsert(Facility, 'other_data', this.batchId, facilityItems);
      const res2 = await validateAndBulkUpsert(Location, 'other_data', this.batchId, locationItems);

      await ledgerCache.flushNewEntriesToMongo(this.batchId, 'Facility');
      await ledgerCache.flushNewEntriesToMongo(this.batchId, 'Location');

      p.processed = locations.length;
      p.success = res1.success + res2.success;
      p.warnings = res1.warnings + res2.warnings;
      p.failed = res1.failed + res2.failed;
      p.status = 'completed';
      onProgress?.(p);
    } catch (err: any) {
      p.status = 'failed';
      p.message = err.message;
      onProgress?.(p);
      throw err;
    }
    return p;
  }

  /**
   * Phase 2.2: Taxonomies
   */
  async runPhase2_2(onProgress?: ProgressCallback): Promise<PhaseProgress> {
    const p: PhaseProgress = {
      phaseKey: 'PHASE_2_2_TAXONOMIES',
      phaseName: 'Phase 2.2: Taxonomies & Categories',
      processed: 0,
      total: 0,
      success: 0,
      warnings: 0,
      failed: 0,
      status: 'running',
    };
    onProgress?.(p);

    try {
      const { categories, subcategoriesByCategory } = await fetchTaxonomies();
      p.total = categories.length + 1; // +1 for UNCATEGORIZED fallback

      const items = [];

      for (const cat of categories) {
        const catCod = cat.CATEG_COD.trim();
        const subs = subcategoriesByCategory.get(catCod) || [];
        const item = transformCategoryToTaxonomy(cat, subs);

        const { objectId } = ledgerCache.getOrCreateObjectId('IM_CATEG_COD', catCod);
        (item.payload as any)._id = objectId;
        items.push(item);
      }

      // Add UNCATEGORIZED fallback
      const uncatItem = createUncategorizedTaxonomy();
      const { objectId: uncatId } = ledgerCache.getOrCreateObjectId('IM_CATEG_COD', 'UNCATEGORIZED');
      (uncatItem.payload as any)._id = uncatId;
      items.push(uncatItem);

      const res = await validateAndBulkUpsert(Taxonomy, 'other_data', this.batchId, items);
      await ledgerCache.flushNewEntriesToMongo(this.batchId, 'Taxonomy');

      p.processed = items.length;
      p.success = res.success;
      p.warnings = res.warnings;
      p.failed = res.failed;
      p.status = 'completed';
      onProgress?.(p);
    } catch (err: any) {
      p.status = 'failed';
      p.message = err.message;
      onProgress?.(p);
      throw err;
    }
    return p;
  }

  /**
   * Phase 2.3: Vendors
   */
  async runPhase2_3(onProgress?: ProgressCallback): Promise<PhaseProgress> {
    const p: PhaseProgress = {
      phaseKey: 'PHASE_2_3_VENDORS',
      phaseName: 'Phase 2.3: Vendors',
      processed: 0,
      total: 0,
      success: 0,
      warnings: 0,
      failed: 0,
      status: 'running',
    };
    onProgress?.(p);

    try {
      const vendors = await fetchVendors();
      p.total = vendors.length + 1; // +1 for INHOUSE fallback

      const items = [];
      for (const v of vendors) {
        const vendNo = v.VEND_NO.trim();
        const item = transformVendor(v);

        const { objectId } = ledgerCache.getOrCreateObjectId('PO_VEND', vendNo, vendNo);
        (item.payload as any)._id = objectId;
        items.push(item);
      }

      // Add INHOUSE vendor
      const inhouseItem = createInhouseVendor();
      const { objectId: inhouseId } = ledgerCache.getOrCreateObjectId('PO_VEND', 'INHOUSE', 'INHOUSE');
      (inhouseItem.payload as any)._id = inhouseId;
      items.push(inhouseItem);

      const res = await validateAndBulkUpsert(Vendor, 'other_data', this.batchId, items);
      await ledgerCache.flushNewEntriesToMongo(this.batchId, 'Vendor');

      p.processed = items.length;
      p.success = res.success;
      p.warnings = res.warnings;
      p.failed = res.failed;
      p.status = 'completed';
      onProgress?.(p);
    } catch (err: any) {
      p.status = 'failed';
      p.message = err.message;
      onProgress?.(p);
      throw err;
    }
    return p;
  }

  /**
   * Phase 3: Products, Variants, and Inventory
   */
  async runPhase3(
    limitProducts?: number,
    onProgress?: ProgressCallback
  ): Promise<{
    productProgress: PhaseProgress;
    variantProgress: PhaseProgress;
    inventoryProgress: PhaseProgress;
  }> {
    const productP: PhaseProgress = {
      phaseKey: 'PHASE_3_1_PRODUCTS',
      phaseName: 'Phase 3.1: Products',
      processed: 0,
      total: limitProducts || 6122,
      success: 0,
      warnings: 0,
      failed: 0,
      status: 'running',
    };
    const variantP: PhaseProgress = {
      phaseKey: 'PHASE_3_2_VARIANTS',
      phaseName: 'Phase 3.2: Variants & Grid Dimensions',
      processed: 0,
      total: 0,
      success: 0,
      warnings: 0,
      failed: 0,
      status: 'running',
    };
    const invP: PhaseProgress = {
      phaseKey: 'PHASE_3_3_INVENTORY',
      phaseName: 'Phase 3.3: Inventory & Locations',
      processed: 0,
      total: 0,
      success: 0,
      warnings: 0,
      failed: 0,
      status: 'running',
    };

    onProgress?.(productP);

    // Build set of valid vendor strings
    const vendorDocs = await Vendor.find({}, { vendorId: 1 }).lean();
    const validVendors = new Set(vendorDocs.map((v: any) => v.vendorId));

    let lastItemNo = '';
    let hasMore = true;
    const batchSize = 500;

    while (hasMore && !this.isPaused) {
      const items = await fetchProductsBatch(lastItemNo, batchSize);
      if (items.length === 0) {
        hasMore = false;
        break;
      }

      const itemNos = items.map((i) => i.ITEM_NO.trim());

      // Fetch supporting variant data for these items in parallel
      const [cellsByItem, barcodesByCell, pricesByCell, headerStock, cellStock] =
        await Promise.all([
          fetchVariantCellsForItems(itemNos),
          fetchBarcodesForItems(itemNos),
          fetchPricesForItems(itemNos),
          fetchHeaderStock(itemNos),
          fetchCellStock(itemNos),
        ]);

      const productBatch = [];
      const variantBatch = [];
      const inventoryBatch = [];
      const invLocationBatch = [];

      for (const item of items) {
        const itemNo = item.ITEM_NO.trim();
        const pItem = transformProduct(item, validVendors);
        const { objectId: prodId } = ledgerCache.getOrCreateObjectId('IM_ITEM', itemNo, itemNo);
        (pItem.payload as any)._id = prodId;
        productBatch.push(pItem);

        const vendorId = pItem.payload.vendorId || 'INHOUSE';

        // Check if item has gridded cells
        const cells = cellsByItem.get(itemNo) || [];
        if (item.TRK_METH === 'G' && cells.length > 0) {
          for (const cell of cells) {
            const cellKey = `${itemNo}|${cell.DIM_1_UPR}|${cell.DIM_2_UPR}|${cell.DIM_3_UPR}`;
            const barcodes = barcodesByCell.get(cellKey) || [];
            const prices = pricesByCell.get(cellKey) || [];

            const vItem = transformVariant(item, cell, prodId, vendorId, barcodes, prices);
            const { objectId: varId } = ledgerCache.getOrCreateObjectId(
              'IM_VARIANT_CELL',
              cellKey,
              vItem.payload.masterSku
            );
            (vItem.payload as any)._id = varId;
            variantBatch.push(vItem);

            // Stock for cell
            const stockRows = cellStock.get(cellKey) || [];
            const { inventoryItem, locationItems } = transformInventory(
              prodId,
              varId,
              vendorId,
              vItem.payload.sku,
              vItem.payload.masterSku,
              stockRows
            );
            inventoryBatch.push(inventoryItem);
            invLocationBatch.push(...locationItems);
          }
        } else {
          // Non-gridded single variant
          const nonGridKey = `${itemNo}|*|*|*`;
          const barcodes = barcodesByCell.get(nonGridKey) || [];
          const prices = pricesByCell.get(nonGridKey) || [];

          const vItem = transformVariant(item, null, prodId, vendorId, barcodes, prices);
          const { objectId: varId } = ledgerCache.getOrCreateObjectId(
            'IM_VARIANT_CELL',
            nonGridKey,
            vItem.payload.masterSku
          );
          (vItem.payload as any)._id = varId;
          variantBatch.push(vItem);

          // Stock for non-gridded item
          const stockRows = headerStock.get(itemNo) || [];
          const { inventoryItem, locationItems } = transformInventory(
            prodId,
            varId,
            vendorId,
            vItem.payload.sku,
            vItem.payload.masterSku,
            stockRows
          );
          inventoryBatch.push(inventoryItem);
          invLocationBatch.push(...locationItems);
        }
      }

      // Bulk upsert products
      const pRes = await validateAndBulkUpsert(Product, 'other_data', this.batchId, productBatch);
      productP.processed += items.length;
      productP.success += pRes.success;
      productP.warnings += pRes.warnings;
      productP.failed += pRes.failed;
      onProgress?.(productP);

      // Bulk upsert variants
      const vRes = await validateAndBulkUpsert(Variant, 'other_data', this.batchId, variantBatch);
      variantP.total += variantBatch.length;
      variantP.processed += variantBatch.length;
      variantP.success += vRes.success;
      variantP.warnings += vRes.warnings;
      variantP.failed += vRes.failed;
      onProgress?.(variantP);

      // Bulk upsert inventory & inventory locations
      const invRes = await validateAndBulkUpsert(Inventory, 'other_data', this.batchId, inventoryBatch);
      if (invLocationBatch.length > 0) {
        await validateAndBulkUpsert(InventoryLocation, 'other_data', this.batchId, invLocationBatch);
      }
      invP.total += inventoryBatch.length;
      invP.processed += inventoryBatch.length;
      invP.success += invRes.success;
      invP.warnings += invRes.warnings;
      invP.failed += invRes.failed;
      onProgress?.(invP);

      await ledgerCache.flushNewEntriesToMongo(this.batchId, 'Variant');

      lastItemNo = items[items.length - 1].ITEM_NO;
      if (limitProducts && productP.processed >= limitProducts) {
        break;
      }
    }

    productP.status = 'completed';
    variantP.status = 'completed';
    invP.status = 'completed';
    onProgress?.(productP);
    onProgress?.(variantP);
    onProgress?.(invP);

    return { productProgress: productP, variantProgress: variantP, inventoryProgress: invP };
  }

  /**
   * Phase 4.1: Customers
   */
  async runPhase4_1(
    limitCustomers?: number,
    onProgress?: ProgressCallback
  ): Promise<PhaseProgress> {
    const p: PhaseProgress = {
      phaseKey: 'PHASE_4_1_CUSTOMERS',
      phaseName: 'Phase 4.1: Walk-In & Agency Customers',
      processed: 0,
      total: limitCustomers || 71038,
      success: 0,
      warnings: 0,
      failed: 0,
      status: 'running',
    };
    onProgress?.(p);

    // Warm up customer ledger domain
    await ledgerCache.warmUpDomains(['AR_CUST_WALKIN']);

    let checkpoint = await MigrationCheckpoint.findOne({ phaseKey: 'PHASE_4_1_CUSTOMERS' });
    let lastCustNo = checkpoint?.lastDocId || '';
    if (checkpoint && checkpoint.processedRows) {
      p.processed = checkpoint.processedRows;
      p.success = checkpoint.processedRows;
    }

    let hasMore = true;
    const batchSize = 2500;

    while (hasMore && !this.isPaused) {
      const customers = await fetchCustomersBatch(lastCustNo, batchSize);
      if (customers.length === 0) {
        hasMore = false;
        break;
      }

      const items = [];
      for (const c of customers) {
        const custNo = c.CUST_NO.trim();
        const item = transformCustomerToWalkIn(c);

        const { objectId } = ledgerCache.getOrCreateObjectId('AR_CUST_WALKIN', custNo);
        (item.payload as any)._id = objectId;
        item.filter = { _id: objectId }; // O(1) B-Tree Primary Key index lookup (70ms per 1k docs)
        items.push(item);
      }

      const res = await validateAndBulkUpsert(WalkInCustomer, 'customers', this.batchId, items);
      p.processed += customers.length;
      p.success += res.success;
      p.warnings += res.warnings;
      p.failed += res.failed;
      onProgress?.(p);

      await ledgerCache.flushNewEntriesToMongo(this.batchId, 'WalkInCustomer');

      lastCustNo = customers[customers.length - 1].CUST_NO;

      await MigrationCheckpoint.findOneAndUpdate(
        { phaseKey: 'PHASE_4_1_CUSTOMERS' },
        {
          lastDocId: lastCustNo,
          processedRows: p.processed,
          totalEstimatedRows: p.total,
          status: 'running',
          updatedAt: new Date(),
        },
        { upsert: true }
      );

      if (limitCustomers && p.processed >= limitCustomers) {
        break;
      }
    }

    p.status = 'completed';
    await MigrationCheckpoint.findOneAndUpdate(
      { phaseKey: 'PHASE_4_1_CUSTOMERS' },
      { status: 'completed', updatedAt: new Date() }
    );
    onProgress?.(p);
    return p;
  }

  /**
   * Phase 4.2: Gift Cards
   */
  async runPhase4_2(onProgress?: ProgressCallback): Promise<PhaseProgress> {
    const p: PhaseProgress = {
      phaseKey: 'PHASE_4_2_GIFTCARDS',
      phaseName: 'Phase 4.2: Gift Cards',
      processed: 0,
      total: 0,
      success: 0,
      warnings: 0,
      failed: 0,
      status: 'running',
    };
    onProgress?.(p);

    try {
      const { cards, activitiesByCardNo } = await fetchGiftCards();
      p.total = cards.length;

      const items = [];
      for (const card of cards) {
        const cardNo = card.GFC_NO.trim();
        const activities = activitiesByCardNo.get(cardNo) || [];
        const item = transformGiftCard(card, activities);

        const { objectId } = ledgerCache.getOrCreateObjectId('SY_GFC', cardNo);
        (item.payload as any)._id = objectId;
        items.push(item);
      }

      const res = await validateAndBulkUpsert(GiftCard, 'other_data', this.batchId, items);
      await ledgerCache.flushNewEntriesToMongo(this.batchId, 'GiftCard');

      p.processed = items.length;
      p.success = res.success;
      p.warnings = res.warnings;
      p.failed = res.failed;
      p.status = 'completed';
      onProgress?.(p);
    } catch (err: any) {
      p.status = 'failed';
      p.message = err.message;
      onProgress?.(p);
      throw err;
    }
    return p;
  }

  /**
   * Phase 4.3: Historical POS Sales Orders (Keyset Paged with Resumable Checkpoint)
   */
  async runPhase4_3(
    limitTickets?: number,
    onProgress?: ProgressCallback
  ): Promise<PhaseProgress> {
    const p: PhaseProgress = {
      phaseKey: 'PHASE_4_3_POS_ORDERS',
      phaseName: 'Phase 4.3: Historical POS Sales Orders',
      processed: 0,
      total: limitTickets || 470431,
      success: 0,
      warnings: 0,
      failed: 0,
      status: 'running',
    };
    onProgress?.(p);

    // Warm up product & variant cache
    await ledgerCache.warmUpDomains(['IM_ITEM', 'IM_VARIANT_CELL']);

    // Check for existing checkpoint
    let checkpoint = await MigrationCheckpoint.findOne({ phaseKey: 'PHASE_4_3_POS_TKT_HIST' });
    let lastDocId = checkpoint?.lastDocId || '0';
    if (checkpoint) {
      p.processed = checkpoint.processedRows;
    }

    let hasMore = true;
    const batchSize = 2500;

    while (hasMore && !this.isPaused) {
      const batch = await fetchNextTicketBatch(lastDocId, batchSize);
      if (!batch || batch.headers.length === 0) {
        hasMore = false;
        break;
      }

      const items = [];
      for (const header of batch.headers) {
        const docId = header.DOC_ID.trim();
        const lines = batch.linesByDocId.get(docId) || [];
        const payments = batch.paymentsByDocId.get(docId) || [];

        const orderItem = transformPosOrder(header, lines, payments);
        const { objectId } = ledgerCache.getOrCreateObjectId('PS_TKT_HIST', docId);
        (orderItem.payload as any)._id = objectId;
        orderItem.filter = { _id: objectId }; // O(1) Primary Key Index Seek
        items.push(orderItem);
      }

      const res = await validateAndBulkUpsert(PosOrder, 'sales_history', this.batchId, items);
      p.processed += batch.headers.length;
      p.success += res.success;
      p.warnings += res.warnings;
      p.failed += res.failed;
      onProgress?.(p);

      lastDocId = batch.lastDocId;

      // Update resumable checkpoint
      await MigrationCheckpoint.findOneAndUpdate(
        { phaseKey: 'PHASE_4_3_POS_TKT_HIST' },
        {
          lastDocId,
          processedRows: p.processed,
          status: 'running',
          updatedAt: new Date(),
        },
        { upsert: true }
      );

      if (limitTickets && p.processed >= limitTickets) {
        break;
      }
    }

    p.status = 'completed';
    await MigrationCheckpoint.findOneAndUpdate(
      { phaseKey: 'PHASE_4_3_POS_TKT_HIST' },
      { status: 'completed', updatedAt: new Date() }
    );
    onProgress?.(p);
    return p;
  }

  /**
   * Phase 4.4: Drawer Session Archives (PS_DRW_SESSION_HIST)
   */
  async runPhase4_4(
    limitSessions?: number,
    onProgress?: ProgressCallback
  ): Promise<PhaseProgress> {
    const p: PhaseProgress = {
      phaseKey: 'PHASE_4_4_DRAWER_SESSIONS',
      phaseName: 'Phase 4.4: Drawer Session Archives',
      processed: 0,
      total: limitSessions || 78417,
      success: 0,
      warnings: 0,
      failed: 0,
      status: 'running',
    };
    onProgress?.(p);

    let lastSessionId = '0';
    let hasMore = true;
    const batchSize = 1000;

    while (hasMore && !this.isPaused) {
      const sessions = await fetchDrawerSessions(lastSessionId, batchSize);
      if (sessions.length === 0) {
        hasMore = false;
        break;
      }

      const items = sessions.map(transformDrawerSessionToReportArchive);
      const res = await validateAndBulkUpsert(CounterPointReportArchive, 'reports', this.batchId, items);

      p.processed += sessions.length;
      p.success += res.success;
      p.warnings += res.warnings;
      p.failed += res.failed;
      onProgress?.(p);

      lastSessionId = sessions[sessions.length - 1].SESSION_ID;
      if (limitSessions && p.processed >= limitSessions) {
        break;
      }
    }

    p.status = 'completed';
    onProgress?.(p);
    return p;
  }

  /**
   * Phase 4.5: Open A/R Items & Invoices (AR_OPN_ITEM)
   */
  async runPhase4_5(
    limitInvoices?: number,
    onProgress?: ProgressCallback
  ): Promise<PhaseProgress> {
    const p: PhaseProgress = {
      phaseKey: 'PHASE_4_5_OPEN_INVOICES',
      phaseName: 'Phase 4.5: Open A/R Invoices',
      processed: 0,
      total: limitInvoices || 265119,
      success: 0,
      warnings: 0,
      failed: 0,
      status: 'running',
    };
    onProgress?.(p);

    let lastDocNo = '';
    let hasMore = true;
    const batchSize = 1000;

    while (hasMore && !this.isPaused) {
      const openItems = await fetchOpenItems(lastDocNo, batchSize);
      if (openItems.length === 0) {
        hasMore = false;
        break;
      }

      const items = openItems.map(transformOpenItemToInvoice);
      const res = await validateAndBulkUpsert(Invoice, 'invoices', this.batchId, items);

      p.processed += openItems.length;
      p.success += res.success;
      p.warnings += res.warnings;
      p.failed += res.failed;
      onProgress?.(p);

      lastDocNo = openItems[openItems.length - 1].DOC_NO;
      if (limitInvoices && p.processed >= limitInvoices) {
        break;
      }
    }

    p.status = 'completed';
    onProgress?.(p);
    return p;
  }
}

export const runner = new MigrationPhaseRunner();
export default runner;
