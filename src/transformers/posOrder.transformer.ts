import mongoose from 'mongoose';
import {
  TicketHeaderSqlRow,
  TicketLineSqlRow,
  SafePaymentSqlRow,
} from '../extractors/sales.extractor';
import { BatchItemInput } from '../loaders/bulkLoader.service';
import { ledgerCache } from '../cache/idLedgerCache';

export function transformPosOrder(
  header: TicketHeaderSqlRow,
  lines: TicketLineSqlRow[] = [],
  payments: SafePaymentSqlRow[] = []
): BatchItemInput {
  const docId = header.DOC_ID.trim();
  const localId = `CP-${docId}`;

  const terminalId = header.STA_ID ? header.STA_ID.trim() : 'CP-HIST';
  const counterNo = header.STA_ID ? header.STA_ID.trim() : '1';
  const cashierName = header.USR_ID?.trim() || header.SLS_REP?.trim() || 'Legacy Cashier';

  const facilityId = header.STK_LOC_ID?.trim() || header.STR_ID?.trim() || 'MAIN';
  const locationId = facilityId;

  const subtotal = Math.max(0, Number(header.SUB_TOT) || 0);
  const discountTotal = Math.max(0, (Number(header.TOT_HDR_DISC) || 0) + (Number(header.TOT_LIN_DISC) || 0));
  const taxTotal = Math.max(0, Number(header.TAX_AMT) || 0);
  const totalAmount = Number(header.TOT) || 0;

  // Safe tender mapping (Strictly NO card numbers or track data!)
  let primaryPaymentMethod = 'CASH';
  const safePayments: any[] = [];

  for (const p of payments) {
    const payCod = p.PAY_COD.toUpperCase();
    let method = 'CASH';
    if (payCod.includes('CHECK')) method = 'CHECK';
    else if (payCod.includes('AR') || payCod.includes('CHARGE')) method = 'AR_CHARGE';
    else if (payCod.includes('GFC') || payCod.includes('GIFT')) method = 'GIFT_CARD';
    else if (payCod.includes('CR') || payCod.includes('CARD') || payCod.includes('VISA') || payCod.includes('MC')) {
      method = 'CARD_SUMMARY';
    }

    safePayments.push({
      method,
      amount: p.AMT,
      reference: `CP-PMT-${p.PMT_SEQ_NO}`,
    });
    primaryPaymentMethod = method;
  }

  if (safePayments.length === 0) {
    safePayments.push({
      method: 'HISTORICAL_BALANCE',
      amount: totalAmount,
    });
    primaryPaymentMethod = 'HISTORICAL_BALANCE';
  }

  // Map Line Items using In-Memory Ledger Cache for ObjectIds
  const items: any[] = [];
  for (const line of lines) {
    const itemNo = line.ITEM_NO;
    const dim1 = line.DIM_1_UPR || '*';
    const dim2 = line.DIM_2_UPR || '*';
    const dim3 = line.DIM_3_UPR || '*';

    const cellKey = `${itemNo}|${dim1}|${dim2}|${dim3}`;
    const productObjectId = ledgerCache.getObjectId('IM_ITEM', itemNo) || new mongoose.Types.ObjectId();
    const variantObjectId = ledgerCache.getObjectId('IM_VARIANT_CELL', cellKey) || new mongoose.Types.ObjectId();

    const parts = [dim1, dim2, dim3].filter((d) => d && d !== '*');
    const sku = parts.length > 0 ? `${itemNo}-${parts.join('-')}` : itemNo;

    const qty = Number(line.QTY_SOLD) || 0;
    const price = Number(line.PRC) || 0;
    const regPrice = Number(line.REG_PRC) || price;
    const discAmt = Number(line.DISC_AMT) || 0;

    items.push({
      productId: productObjectId,
      variantId: variantObjectId,
      sku,
      productName: line.DESCR || itemNo,
      qty,
      price,
      originalPrice: regPrice,
      discountAmount: discAmt,
      unitsUsed: 0,
      itemType: 'regular_sale' as const,
      itemStatus: 'picked_up' as const,
    });
  }

  const syncTimestamp = header.BUS_DAT || header.TKT_DT || new Date();

  const payload = {
    localId,
    terminalId,
    counterNo,
    cashierName,
    facilityId,
    locationId,
    subtotal,
    discountTotal,
    taxTotal,
    totalAmount,
    totalUnitsUsed: 0,
    paymentMethod: primaryPaymentMethod,
    payments: safePayments,
    receiptData: {
      source: 'NCR_COUNTERPOINT_HIST',
      ticketNo: header.TKT_NO.trim(),
      docId,
      storeId: header.STR_ID.trim(),
      busDate: header.BUS_DAT,
    },
    items,
    status: 'completed' as const,
    syncTimestamp,
    createdAt: syncTimestamp,
    updatedAt: syncTimestamp,
  };

  return {
    identifier: localId,
    filter: { localId },
    payload,
    safeSummaryData: { localId, ticketNo: header.TKT_NO.trim(), totalAmount, lineCount: items.length },
  };
}
