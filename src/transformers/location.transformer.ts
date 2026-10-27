import { LocationSqlRow } from '../extractors/reference.extractor';
import { BatchItemInput } from '../loaders/bulkLoader.service';

export function transformLocationToFacility(row: LocationSqlRow): BatchItemInput {
  const locId = row.LOC_ID.trim();
  const descr = row.DESCR ? row.DESCR.trim() : locId;

  // Type mapping: MAIN / MOBIL -> retail_store, WAREHOUSE -> warehouse, ONLINE -> other
  let type: 'retail_store' | 'warehouse' | 'other' = 'other';
  if (['MAIN', 'MOBIL'].includes(locId)) {
    type = 'retail_store';
  } else if (locId === 'WAREHOUSE') {
    type = 'warehouse';
  }

  const street = [row.ADRS_1, row.ADRS_2, row.ADRS_3]
    .filter((a) => a && a.trim().length > 0)
    .map((a) => a!.trim())
    .join(', ');

  const payload = {
    facilityId: locId,
    name: descr,
    code: locId.toUpperCase(),
    type,
    address: {
      street: street || '',
      city: row.CITY ? row.CITY.trim() : '',
      state: row.STATE ? row.STATE.trim() : '',
      country: row.CNTRY ? row.CNTRY.trim() : 'USA',
      zipCode: row.ZIP_COD ? row.ZIP_COD.trim() : '',
    },
    contact: {
      phone: row.PHONE_1 ? row.PHONE_1.trim() : '',
      email: row.EMAIL_ADRS_1 ? row.EMAIL_ADRS_1.trim() : '',
      managerName: row.CONTCT_1 ? row.CONTCT_1.trim() : '',
    },
    isPrimary: locId === 'MAIN',
    isActive: row.RS_STAT === 1 || row.RS_STAT === 0,
    notes: 'Migrated from CounterPoint IM_LOC',
  };

  return {
    identifier: locId,
    filter: { facilityId: locId },
    payload,
    safeSummaryData: { LOC_ID: locId, DESCR: descr },
  };
}

export function transformLocationToWarehouse(
  row: LocationSqlRow,
  distinctBins: string[] = []
): BatchItemInput {
  const locId = row.LOC_ID.trim();
  const descr = row.DESCR ? row.DESCR.trim() : locId;

  let locationType: 'showroom' | 'warehouse' | 'other' = 'other';
  if (['MAIN', 'MOBIL'].includes(locId)) {
    locationType = 'showroom';
  } else if (locId === 'WAREHOUSE') {
    locationType = 'warehouse';
  }

  const canSellDirectly = ['MAIN', 'MOBIL', 'ONLINE'].includes(locId);

  const street = [row.ADRS_1, row.ADRS_2, row.ADRS_3]
    .filter((a) => a && a.trim().length > 0)
    .map((a) => a!.trim())
    .join(', ');

  // Always seed default bin + any distinct bins found in IM_INV
  const binsSet = new Set<string>(['DEFAULT', ...distinctBins.filter(Boolean)]);
  const bins = Array.from(binsSet).map((binCode) => ({
    binId: binCode,
    binCode,
    structureType: 'bin' as const,
    isUnlimitedCapacity: true,
    status: 'active' as const,
  }));

  const payload = {
    warehouseId: locId,
    warehouseName: descr,
    facilityId: locId,
    facilityName: descr,
    locationType,
    canSellDirectly,
    allowsReceiving: ['WAREHOUSE', 'MAIN'].includes(locId),
    isCustomerHold: false,
    address: {
      street: street || '',
      city: row.CITY ? row.CITY.trim() : '',
      state: row.STATE ? row.STATE.trim() : '',
      country: row.CNTRY ? row.CNTRY.trim() : 'USA',
      zipCode: row.ZIP_COD ? row.ZIP_COD.trim() : '',
    },
    bins,
    isActive: true,
  };

  return {
    identifier: locId,
    filter: { warehouseId: locId },
    payload,
    safeSummaryData: { LOC_ID: locId, BIN_COUNT: bins.length },
  };
}
