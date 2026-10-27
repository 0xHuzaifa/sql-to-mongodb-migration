import mongoose from 'mongoose';
import { HeaderStockSqlRow, CellStockSqlRow } from '../extractors/inventory.extractor';
import { BatchItemInput } from '../loaders/bulkLoader.service';

export function transformInventory(
  productObjectId: mongoose.Types.ObjectId,
  variantObjectId: mongoose.Types.ObjectId,
  vendorId: string,
  sku: string,
  masterSku: string,
  stockRows: (HeaderStockSqlRow | CellStockSqlRow)[]
): {
  inventoryItem: BatchItemInput;
  locationItems: BatchItemInput[];
} {
  let totalOnHand = 0;
  let totalCommit = 0;
  let totalOnPo = 0;
  let totalOnBo = 0;
  let minQty = 0;
  let maxQty = 0;

  const locationItems: BatchItemInput[] = [];
  const warnings: string[] = [];
  const cpLocations: any[] = [];

  for (const row of stockRows) {
    const onHand = Number(row.QTY_ON_HND) || 0;
    const commit = Math.max(0, Number(row.QTY_COMMIT) || 0);
    const onPo = Math.max(0, Number(row.QTY_ON_PO) || 0);
    const onBo = Math.max(0, Number(row.QTY_ON_BO) || 0);

    totalOnHand += onHand;
    totalCommit += commit;
    totalOnPo += onPo;
    totalOnBo += onBo;
    minQty += Math.max(0, Number(row.MIN_QTY) || 0);
    maxQty = Math.max(maxQty, Number(row.MAX_QTY) || 0);

    const warehouseId = row.LOC_ID.trim();
    const binId = ('BIN_1' in row && row.BIN_1) ? row.BIN_1.trim() : 'DEFAULT';

    cpLocations.push({
      locId: warehouseId,
      bin: binId,
      onHand,
      commit,
    });

    // Enforce InventoryLocation min: 1 constraint
    if (onHand >= 1) {
      locationItems.push({
        identifier: `${variantObjectId.toString()}::${warehouseId}::${binId}`,
        filter: {
          variantId: variantObjectId,
          warehouseId,
          binId,
        },
        payload: {
          inventoryId: new mongoose.Types.ObjectId(), // Will be resolved during load or set to target
          variantId: variantObjectId,
          warehouseId,
          binId,
          quantity: Math.floor(onHand),
        },
        safeSummaryData: { warehouseId, binId, quantity: onHand },
      });
    } else if (onHand < 0) {
      warnings.push(`Location ${warehouseId} has negative stock (${onHand}) for SKU ${sku}`);
    }
  }

  const payload = {
    productId: productObjectId,
    variantId: variantObjectId,
    vendorId,
    vendorSku: sku,
    masterSku,
    origin: 'inhouse' as const,
    syncType: 'inhouse' as const,
    qtyOnHand: Math.max(0, totalOnHand), // Total on hand (clamped >= 0 per target model)
    qtyReserved: totalCommit,
    moq: 1,
    location: {
      warehouseId: stockRows.length > 0 ? stockRows[0].LOC_ID.trim() : 'MAIN',
      binCode: 'DEFAULT',
    },
    vendorRawData: {
      rawTotalOnHand: totalOnHand,
      cpLocations,
    },
  };

  const inventoryItem: BatchItemInput = {
    identifier: `${vendorId}::${sku}`,
    filter: { masterSku },
    payload,
    warnings: warnings.length > 0 ? warnings : undefined,
    safeSummaryData: { sku, masterSku, totalOnHand, totalCommit },
  };

  return { inventoryItem, locationItems };
}
