import { DrawerSessionSqlRow, OpenItemSqlRow } from '../extractors/reportsAndInvoices.extractor';
import { BatchItemInput } from '../loaders/bulkLoader.service';

export function transformDrawerSessionToReportArchive(row: DrawerSessionSqlRow): BatchItemInput {
  const drwId = row.DRW_ID ? row.DRW_ID.trim() : 'DRW';
  const sessionId = row.SESSION_ID ? row.SESSION_ID.trim() : '0';
  const reportId = `${drwId}-${sessionId}`;
  const reportName = `${row.STR_ID?.trim() || 'Store'} Drawer ${drwId} Session ${sessionId}`;

  const payload = {
    reportId,
    reportName,
    reportType: 'EOD_ZOUT',
    periodStart: row.OPEN_DT || undefined,
    periodEnd: row.CLOSE_DT || undefined,
    totalSales: Number(row.TOT_SAL) || 0,
    taxCollected: Number(row.TOT_TAX) || 0,
    transactionCount: Number(row.SAL_TKT_CNT) || 0,
    notes: `Migrated from PS_DRW_SESSION_HIST (Store ${row.STR_ID?.trim() || 'Store'})`,
    rawData: {
      strId: row.STR_ID?.trim(),
      usrId: row.USR_ID?.trim(),
    },
  };

  return {
    identifier: reportId,
    filter: { reportId },
    payload,
    safeSummaryData: { reportId, totalSales: payload.totalSales },
  };
}

export function transformOpenItemToInvoice(row: OpenItemSqlRow): BatchItemInput {
  const docNo = row.DOC_NO ? row.DOC_NO.trim() : 'AR-0';
  const invoiceNumber = `CP-AR-${docNo}`;
  const custNo = row.CUST_NO ? row.CUST_NO.trim() : 'UNKNOWN';
  const amt = Number(row.AMT) || 0;
  const bal = Number(row.BAL) || 0;

  const docDate = row.DOC_DAT || new Date();
  const dueDate = new Date(docDate);
  dueDate.setDate(dueDate.getDate() + 30); // Net 30 default

  let status: 'draft' | 'sent' | 'paid' | 'overdue' = 'sent';
  if (bal <= 0) {
    status = 'paid';
  } else if (new Date() > dueDate) {
    status = 'overdue';
  }

  const payload = {
    invoiceNumber,
    companyName: `Account #${custNo}`,
    companyType: 'walkin' as const,
    dateFrom: docDate,
    dateTo: docDate,
    invoiceDate: docDate,
    dueDate,
    status,
    totalOrders: 1,
    subtotal: amt,
    taxTotal: 0,
    grandTotal: amt,
    cashPaidTotal: Math.max(0, amt - bal),
    lineItems: [],
    title: `CounterPoint A/R Item ${docNo} (${row.DOC_TYP?.trim() || 'Invoice'})`,
    notes: `Migrated from AR_OPN_ITEM. Terms: ${row.TERMS_COD?.trim() || 'NET30'}`,
    emailLog: [],
    createdBy: 'CounterPointMigration',
  };

  return {
    identifier: invoiceNumber,
    filter: { invoiceNumber },
    payload,
    safeSummaryData: { invoiceNumber, custNo, grandTotal: amt, balance: bal },
  };
}
