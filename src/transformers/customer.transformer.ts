import { CustomerSqlRow, GiftCardSqlRow, GiftCardActivitySqlRow } from '../extractors/customer.extractor';
import { BatchItemInput } from '../loaders/bulkLoader.service';

export function transformCustomerToWalkIn(row: CustomerSqlRow): BatchItemInput {
  const custNo = row.CUST_NO.trim();
  const rawNam = row.NAM ? row.NAM.trim() : custNo;

  // First name & last name splitting
  let firstName = row.FST_NAM ? row.FST_NAM.trim() : '';
  let lastName = row.LST_NAM ? row.LST_NAM.trim() : '';

  if (!firstName) {
    const parts = rawNam.split(/\s+/);
    firstName = parts[0] || custNo;
    lastName = parts.slice(1).join(' ');
  }

  const email = row.EMAIL_ADRS_1 ? row.EMAIL_ADRS_1.trim().toLowerCase() : '';

  const phones = [row.PHONE_1, row.PHONE_2, row.MBL_PHONE_1, row.MBL_PHONE_2]
    .filter((p) => p && p.trim().length > 0)
    .map((p) => ({ phone: p!.trim(), type: 'Phone' }));

  const street = [row.ADRS_1, row.ADRS_2]
    .filter((a) => a && a.trim().length > 0)
    .map((a) => a!.trim())
    .join(', ');

  const discountPercent = Math.min(100, Math.max(0, Number(row.DISC_PCT) || 0));
  const isTaxExempt = Boolean(row.TAX_EXEMPT_NO && row.TAX_EXEMPT_NO.trim() !== '');

  // Check if corporate affiliation exists via CATEG_COD or USER_PARENT_CUST_NO
  const isCompany = Boolean(row.CATEG_COD || row.USER_PARENT_CUST_NO);
  const companies: any[] = [];
  if (isCompany) {
    const companyName = row.CATEG_COD ? row.CATEG_COD.trim() : `Agency-${row.USER_PARENT_CUST_NO?.trim()}`;
    companies.push({
      companyName,
      allotmentType: 'money' as const,
      totalAllotment: 0,
      usedAllotment: 0,
      allotmentValue: 0,
      isUnlimited: false,
    });
  }

  const payload = {
    firstName,
    lastName,
    email,
    contact: phones,
    source: 'counterpoint_migration',
    address: {
      street: street || '',
      city: row.CITY ? row.CITY.trim() : '',
      state: row.STATE ? row.STATE.trim() : '',
      zip: row.ZIP_COD ? row.ZIP_COD.trim() : '',
    },
    discountPercent,
    isTaxExempt,
    taxId: row.TAX_COD ? row.TAX_COD.trim() : '',
    taxExemptNumber: row.TAX_EXEMPT_NO ? row.TAX_EXEMPT_NO.trim() : '',
    isCompany,
    companies,
  };

  return {
    identifier: custNo,
    filter: { email: email ? email : undefined, 'address.street': street || undefined, firstName, lastName },
    payload,
    safeSummaryData: { CUST_NO: custNo, NAM: rawNam, CATEG_COD: row.CATEG_COD },
  };
}

export function transformGiftCard(
  card: GiftCardSqlRow,
  activities: GiftCardActivitySqlRow[] = []
): BatchItemInput {
  const barcode = card.GFC_NO.trim();
  const initialBalance = Math.max(0, Number(card.ORIG_AMT) || 0);
  const currentBalance = Math.max(0, Number(card.CURR_AMT) || 0);
  const isActive = card.IS_VOID !== 'Y' && currentBalance > 0;

  let running = 0;
  const transactions = activities.map((act) => {
    let type: 'issue' | 'redemption' | 'reload' | 'void' = 'redemption';
    const actTyp = act.ACTIV_TYP ? act.ACTIV_TYP.trim().toUpperCase() : '';
    if (actTyp === 'I' || actTyp === 'ISSUE') type = 'issue';
    else if (actTyp === 'R' || actTyp === 'RELOAD') type = 'reload';
    else if (actTyp === 'V' || actTyp === 'VOID') type = 'void';

    const amt = Math.abs(act.AMT);
    running = type === 'issue' || type === 'reload' ? running + amt : running - amt;

    return {
      type,
      amount: amt,
      balanceAfter: Math.max(0, running),
      referenceId: act.DOC_NO || '',
      cashierName: act.USR_ID || 'System',
      notes: act.COMMNT || '',
      createdAt: act.ACTIV_DAT || new Date(),
    };
  });

  const payload = {
    barcode,
    initialBalance,
    currentBalance,
    isActive,
    transactions,
  };

  return {
    identifier: barcode,
    filter: { barcode },
    payload,
    safeSummaryData: { barcode, currentBalance, isActive },
  };
}
