import mongoose from 'mongoose';
import {
  ItemSqlRow,
  VariantCellSqlRow,
  BarcodeSqlRow,
  PriceSqlRow,
} from '../extractors/catalog.extractor';
import { resolveDimensionTag } from '../config/dimensionMap.config';
import { BatchItemInput } from '../loaders/bulkLoader.service';

export function transformProduct(
  item: ItemSqlRow,
  validVendors: Set<string>
): BatchItemInput {
  const itemNo = item.ITEM_NO.trim();
  const rawDescr = item.DESCR ? item.DESCR.trim() : '';

  // name field gets the productMasterSku mapping (itemNo)
  let name = itemNo;
  const warnings: string[] = [];
  if (name.length < 3) {
    name = `SKU-${name}`;
    warnings.push(`Padded short itemNo ('${itemNo}') to '${name}' for name minLength requirement`);
  }
  if (name.length > 200) {
    name = name.substring(0, 200);
  }

  // Vendor resolution: string vendorId, fallback to 'INHOUSE'
  let vendorId = 'INHOUSE';
  if (item.ITEM_VEND_NO && validVendors.has(item.ITEM_VEND_NO.trim())) {
    vendorId = item.ITEM_VEND_NO.trim();
  }

  // Item type enum
  let itemType: 'Inventory' | 'Non-inventory' | 'Service' | 'Discount' = 'Inventory';
  if (item.ITEM_TYP === 'N') itemType = 'Non-inventory';
  else if (item.ITEM_TYP === 'S') itemType = 'Service';
  else if (item.ITEM_TYP === 'D') itemType = 'Discount';

  const description = [item.LONG_DESCR, item.SHORT_DESCR]
    .filter(Boolean)
    .map((d) => d!.trim())
    .join('\n') || '';

  const payload = {
    vendorId,
    syncType: 'INHOUSE' as const,
    productMasterSku: itemNo,
    name,
    description,
    category: item.CATEG_COD ? item.CATEG_COD.trim() : 'UNCATEGORIZED',
    subcategory: item.SUBCAT_COD ? item.SUBCAT_COD.trim() : null,
    brand: item.ATTR_COD_1 ? item.ATTR_COD_1.trim() : null,
    manufacturer: item.ATTR_COD_1 ? item.ATTR_COD_1.trim() : null,
    status: item.STAT === 'A' ? ('active' as const) : ('archived' as const),
    itemType,
    discountable: item.IS_DISCNTBL === 'Y',
    taxable: item.IS_TXBL === 'Y',
    additionalDescription1: rawDescr || (item.ADDL_DESCR_1 ? item.ADDL_DESCR_1.trim() : ''),
    additionalDescription2: item.ADDL_DESCR_1 ? item.ADDL_DESCR_1.trim() : (item.ADDL_DESCR_2 ? item.ADDL_DESCR_2.trim() : ''),
    additionalDescription3: item.ADDL_DESCR_3 ? item.ADDL_DESCR_3.trim() : '',
    taxCategory: item.TAX_CATEG_COD ? item.TAX_CATEG_COD.trim() : null,
    warrentyPeriod1: Math.max(0, Number(item.WARR_PRD_1) || 0),
    warrentyPeriod2: Math.max(0, Number(item.WARR_PRD_2) || 0),
    barcode: item.BARCOD ? item.BARCOD.trim() : null,
    upc: item.BARCOD ? item.BARCOD.trim() : null,
  };

  return {
    identifier: itemNo,
    filter: { vendorId, productMasterSku: itemNo },
    payload,
    warnings: warnings.length > 0 ? warnings : undefined,
    safeSummaryData: { ITEM_NO: itemNo, DESCR: rawDescr, VEND_NO: vendorId },
  };
}

export function transformVariant(
  item: ItemSqlRow,
  cell: VariantCellSqlRow | null,
  productObjectId: mongoose.Types.ObjectId,
  vendorId: string,
  barcodes: BarcodeSqlRow[] = [],
  prices: PriceSqlRow[] = []
): BatchItemInput {
  const itemNo = item.ITEM_NO.trim();
  const isGridded = item.TRK_METH === 'G' && cell !== null;

  let sku = itemNo;
  let masterSku = itemNo;
  let sizeVal: string | null = null;
  let colorVal: string[] = [];
  let lengthVal: string | null = null;
  const additionalAttributes: Record<string, any> = {};
  const warnings: string[] = [];

  if (isGridded && cell) {
    const dim1 = cell.DIM_1_UPR;
    const dim2 = cell.DIM_2_UPR;
    const dim3 = cell.DIM_3_UPR;

    const parts = [dim1, dim2, dim3].filter((d) => d && d !== '*');
    sku = parts.length > 0 ? `${itemNo}-${parts.join('-')}` : itemNo;
    masterSku = sku;

    // Resolve Dimension 1
    const res1 = resolveDimensionTag(item.GRID_DIM_1_TAG, 1);
    if (res1.target === 'size') sizeVal = cell.DISPLAY_DIM_1 || dim1;
    else if (res1.target === 'color') colorVal = [cell.DISPLAY_DIM_1 || dim1];
    else if (res1.target === 'length') lengthVal = cell.DISPLAY_DIM_1 || dim1;
    else {
      additionalAttributes[res1.attributeKey] = cell.DISPLAY_DIM_1 || dim1;
      if (res1.flagWarning) warnings.push(`Anomalous tag on dim 1: ${res1.originalTag}`);
    }

    // Resolve Dimension 2
    const res2 = resolveDimensionTag(item.GRID_DIM_2_TAG, 2);
    if (res2.target === 'size') sizeVal = sizeVal || cell.DISPLAY_DIM_2 || dim2;
    else if (res2.target === 'color') colorVal = colorVal.length ? colorVal : [cell.DISPLAY_DIM_2 || dim2];
    else if (res2.target === 'length') lengthVal = lengthVal || cell.DISPLAY_DIM_2 || dim2;
    else {
      additionalAttributes[res2.attributeKey] = cell.DISPLAY_DIM_2 || dim2;
      if (res2.flagWarning) warnings.push(`Anomalous tag on dim 2: ${res2.originalTag}`);
    }

    // Resolve Dimension 3
    const res3 = resolveDimensionTag(item.GRID_DIM_3_TAG, 3);
    if (res3.target === 'size') sizeVal = sizeVal || cell.DISPLAY_DIM_3 || dim3;
    else if (res3.target === 'color') colorVal = colorVal.length ? colorVal : [cell.DISPLAY_DIM_3 || dim3];
    else if (res3.target === 'length') lengthVal = lengthVal || cell.DISPLAY_DIM_3 || dim3;
    else {
      additionalAttributes[res3.attributeKey] = cell.DISPLAY_DIM_3 || dim3;
      if (res3.flagWarning) warnings.push(`Anomalous tag on dim 3: ${res3.originalTag}`);
    }

    // Coordinates preserved for CounterPoint POS barcode scanning
    additionalAttributes.cpCellKey = `${itemNo}|${dim1}|${dim2}|${dim3}`;
    additionalAttributes.cpDimTags = {
      dim1: item.GRID_DIM_1_TAG || '',
      dim2: item.GRID_DIM_2_TAG || '',
      dim3: item.GRID_DIM_3_TAG || '',
    };
  }

  // Barcodes
  const primaryBarcode = barcodes.length > 0 ? barcodes[0].BARCOD : item.BARCOD ? item.BARCOD.trim() : null;
  const additionalBarcodes = barcodes.map((b) => b.BARCOD);

  // Pricing
  let price = Math.max(0, Number(item.PRC_1) || 0);
  let regularPrice = Math.max(0, Number(item.REG_PRC) || price);
  let alt1: number | undefined;
  let alt2: number | undefined;
  let alt3: number | undefined;

  // Check if cell or location price overrides exist
  const matchingPrice = prices.find((p) => p.LOC_ID.trim() === 'MAIN' || p.LOC_ID.trim() === '*');
  if (matchingPrice) {
    if (matchingPrice.PRC_1 != null) price = Math.max(0, Number(matchingPrice.PRC_1));
    if (matchingPrice.REG_PRC != null) regularPrice = Math.max(0, Number(matchingPrice.REG_PRC));
    if (matchingPrice.PRC_2 != null) alt1 = Math.max(0, Number(matchingPrice.PRC_2));
    if (matchingPrice.PRC_3 != null) alt2 = Math.max(0, Number(matchingPrice.PRC_3));
    if (matchingPrice.PRC_4 != null) alt3 = Math.max(0, Number(matchingPrice.PRC_4));
  }

  const costPrice = Math.max(0, Number(item.LST_COST) || 0);

  const payload = {
    productId: productObjectId,
    vendorId,
    sku,
    masterSku,
    size: sizeVal || undefined,
    color: colorVal.length ? colorVal : undefined,
    length: lengthVal || undefined,
    price,
    regularPrice,
    originalPrice: regularPrice,
    costPrice,
    lastCost: costPrice,
    alternatePrice1: alt1,
    alternatePrice2: alt2,
    alternatePrice3: alt3,
    barcode: primaryBarcode || undefined,
    upc: primaryBarcode || undefined,
    additionalBarcodes,
    additionalAttributes,
  };

  return {
    identifier: `${vendorId}::${sku}`,
    filter: { masterSku },
    payload,
    warnings: warnings.length > 0 ? warnings : undefined,
    safeSummaryData: { sku, masterSku, price, barcode: primaryBarcode },
  };
}
