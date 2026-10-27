import { VendorSqlRow } from '../extractors/reference.extractor';
import { BatchItemInput } from '../loaders/bulkLoader.service';

export function transformVendor(row: VendorSqlRow): BatchItemInput {
  const vendNo = row.VEND_NO.trim();
  const name = row.NAM ? row.NAM.trim() : vendNo;

  const payload = {
    vendorId: vendNo, // Exact string preserved (e.g. "00120")
    name,
    syncType: 'INHOUSE' as const,
    isActive: row.RS_STAT === 1 || row.RS_STAT === 0,
    connection: {},
    validationRules: {
      requiredFields: ['vendorSku', 'name', 'price'],
    },
    retryPolicy: {
      maxAttempts: 3,
      retryIntervalMinutes: 15,
    },
    fieldMappings: [],
    mappingStats: {
      totalFields: 0,
      mappedFields: 0,
      unmappedFields: [],
      lastSyncDate: new Date(),
      mappingAccuracy: 100,
    },
  };

  return {
    identifier: vendNo,
    filter: { vendorId: vendNo },
    payload,
    safeSummaryData: { VEND_NO: vendNo, NAM: name },
  };
}

export function createInhouseVendor(): BatchItemInput {
  return {
    identifier: 'INHOUSE',
    filter: { vendorId: 'INHOUSE' },
    payload: {
      vendorId: 'INHOUSE',
      name: 'Internal In-House Store Catalog',
      syncType: 'INHOUSE' as const,
      isActive: true,
      validationRules: {
        requiredFields: ['vendorSku', 'name', 'price'],
      },
    },
    safeSummaryData: { VEND_NO: 'INHOUSE' },
  };
}
