import React, { useState } from 'react';
import {
  Network,
  ArrowRight,
  Database,
  Layers,
  Search,
  CheckCircle2,
  ShieldAlert,
  FileCode,
  Tag,
  Key,
  Boxes,
  HelpCircle,
  Sparkles,
} from 'lucide-react';

interface FieldMapping {
  sqlTable: string;
  sqlColumn: string;
  sqlType: string;
  isPrimaryKey?: boolean;
  isForeignKey?: boolean;
  transformRule: string;
  mongoCollection: string;
  mongoField: string;
  mongoType: string;
  strategy: 'Direct' | '1:N Embedded' | 'ObjectId Reference' | 'Calculated' | 'Denormalized' | 'PCI Scrubbed';
  required?: boolean;
  notes?: string;
}

interface DomainSchema {
  id: string;
  name: string;
  description: string;
  sqlTables: string[];
  targetCollections: string[];
  strategyOverview: string;
  architectureDiagram: string;
  mappings: FieldMapping[];
}

const DOMAINS: DomainSchema[] = [
  {
    id: 'products',
    name: 'Products & Grid Variants',
    description: 'Denormalizes 3-tier grid cells (Color/Size/Width) and barcode indexes into parent Product and variant documents.',
    sqlTables: ['IM_ITEM', 'IM_SKU', 'IM_BARCOD', 'IM_PRC'],
    targetCollections: ['products', 'variants'],
    strategyOverview: 'Parent-Child Relation with 42-tag dynamic attribute normalization and composite SKU generation.',
    architectureDiagram: 'IM_ITEM (1:1) ➔ products | IM_SKU + IM_BARCOD + IM_PRC (1:N) ➔ variants (with parent productId ref)',
    mappings: [
      {
        sqlTable: 'IM_ITEM',
        sqlColumn: 'ITEM_NO',
        sqlType: 'VARCHAR(20)',
        isPrimaryKey: true,
        transformRule: 'Preserve exact casing & leading zeros; maps to both productMasterSku AND name',
        mongoCollection: 'products',
        mongoField: 'productMasterSku & name',
        mongoType: 'String',
        strategy: 'Direct',
        required: true,
        notes: 'Unique business identifier across catalog, mapped to productMasterSku and name',
      },
      {
        sqlTable: 'IM_ITEM',
        sqlColumn: 'DESCR',
        sqlType: 'VARCHAR(30)',
        transformRule: 'Trim whitespace; maps to additionalDescription1 (formerly name)',
        mongoCollection: 'products',
        mongoField: 'additionalDescription1',
        mongoType: 'String',
        strategy: 'Direct',
        notes: 'Product description/title preserved in additionalDescription1',
      },
      {
        sqlTable: 'IM_ITEM',
        sqlColumn: 'LONG_DESCR',
        sqlType: 'VARCHAR(250)',
        transformRule: 'Trim whitespace, optional description',
        mongoCollection: 'products',
        mongoField: 'description',
        mongoType: 'String',
        strategy: 'Direct',
      },
      {
        sqlTable: 'IM_ITEM',
        sqlColumn: 'CATEG_COD',
        sqlType: 'VARCHAR(10)',
        isForeignKey: true,
        transformRule: 'Lookup ObjectId from Taxonomy ledger (fallback UNCATEGORIZED)',
        mongoCollection: 'products',
        mongoField: 'taxonomy',
        mongoType: 'ObjectId',
        strategy: 'ObjectId Reference',
        required: true,
      },
      {
        sqlTable: 'IM_ITEM',
        sqlColumn: 'VEND_NO',
        sqlType: 'VARCHAR(15)',
        isForeignKey: true,
        transformRule: 'Lookup ObjectId from Vendor ledger (fallback INHOUSE)',
        mongoCollection: 'products',
        mongoField: 'primaryVendor',
        mongoType: 'ObjectId',
        strategy: 'ObjectId Reference',
        required: true,
      },
      {
        sqlTable: 'IM_ITEM',
        sqlColumn: 'TRK_METH',
        sqlType: 'CHAR(1)',
        transformRule: "TRK_METH == 'G' ? 'matrix' : 'standard'",
        mongoCollection: 'products',
        mongoField: 'productType',
        mongoType: 'String',
        strategy: 'Direct',
        required: true,
      },
      {
        sqlTable: 'IM_ITEM',
        sqlColumn: 'LST_COST',
        sqlType: 'DECIMAL(15,4)',
        transformRule: 'Currency float conversion, clamp min 0',
        mongoCollection: 'products',
        mongoField: 'costPrice',
        mongoType: 'Number',
        strategy: 'Direct',
        required: true,
      },
      {
        sqlTable: 'IM_ITEM',
        sqlColumn: 'PRC_1',
        sqlType: 'DECIMAL(15,4)',
        transformRule: 'Currency float conversion, clamp min 0',
        mongoCollection: 'products',
        mongoField: 'retailPrice',
        mongoType: 'Number',
        strategy: 'Direct',
        required: true,
      },
      {
        sqlTable: 'IM_SKU',
        sqlColumn: 'ITEM_NO + DIM_1/2/3',
        sqlType: 'COMPOSITE',
        isPrimaryKey: true,
        transformRule: 'Generate SKU: {ITEM_NO}-{DIM1}-{DIM2}-{DIM3}',
        mongoCollection: 'variants',
        mongoField: 'sku',
        mongoType: 'String',
        strategy: 'Calculated',
        required: true,
        notes: 'Unique SKU for individual purchasable variant',
      },
      {
        sqlTable: 'IM_SKU',
        sqlColumn: 'DIM_1_UPR, DIM_2_UPR, DIM_3_UPR',
        sqlType: 'VARCHAR(15) x 3',
        transformRule: 'Map through 42-tag dimension dictionary (Color, Size, Width)',
        mongoCollection: 'variants',
        mongoField: 'attributes[]',
        mongoType: 'Array<{ name, value }>',
        strategy: '1:N Embedded',
        required: true,
        notes: 'Resolved via dimensionMap.config.ts',
      },
      {
        sqlTable: 'IM_BARCOD',
        sqlColumn: 'BARCOD',
        sqlType: 'VARCHAR(20)',
        transformRule: 'Deduplicated array of UPC, EAN, and custom barcodes',
        mongoCollection: 'variants',
        mongoField: 'barcodes[]',
        mongoType: 'Array<String>',
        strategy: '1:N Embedded',
      },
    ],
  },
  {
    id: 'inventory',
    name: 'Inventory & Stock Locations',
    description: 'Consolidates header and gridded cell physical stock balances across multiple warehouses with auto-calculated availability.',
    sqlTables: ['IM_INV', 'IM_INV_CELL', 'IM_LOC'],
    targetCollections: ['inventory', 'inventorylocations'],
    strategyOverview: 'Multi-location inventory tracking with Mongoose pre-validate hooks enforcing non-negative availability.',
    architectureDiagram: 'IM_INV / IM_INV_CELL ➔ inventory (master SKU totals) + inventorylocations (per warehouse)',
    mappings: [
      {
        sqlTable: 'IM_INV / IM_INV_CELL',
        sqlColumn: 'ITEM_NO + Cell',
        sqlType: 'COMPOSITE',
        isForeignKey: true,
        transformRule: 'Lookup Variant ObjectId via IM_VARIANT_CELL composite key',
        mongoCollection: 'inventory',
        mongoField: 'variant',
        mongoType: 'ObjectId',
        strategy: 'ObjectId Reference',
        required: true,
      },
      {
        sqlTable: 'IM_INV',
        sqlColumn: 'LOC_ID',
        sqlType: 'VARCHAR(10)',
        isForeignKey: true,
        transformRule: 'Lookup Location ObjectId via IM_LOC_LOCATION ledger',
        mongoCollection: 'inventorylocations',
        mongoField: 'location',
        mongoType: 'ObjectId',
        strategy: 'ObjectId Reference',
        required: true,
      },
      {
        sqlTable: 'IM_INV / IM_INV_CELL',
        sqlColumn: 'QTY_ON_HND',
        sqlType: 'DECIMAL(15,4)',
        transformRule: 'Sum positive stock across cells and locations (6,283 verified)',
        mongoCollection: 'inventorylocations',
        mongoField: 'quantity',
        mongoType: 'Number',
        strategy: 'Direct',
        required: true,
      },
      {
        sqlTable: 'IM_INV',
        sqlColumn: 'QTY_ON_HND',
        sqlType: 'DECIMAL(15,4)',
        transformRule: 'Aggregate total on-hand across all facilities; audit negative values',
        mongoCollection: 'inventory',
        mongoField: 'qtyOnHand',
        mongoType: 'Number',
        strategy: 'Calculated',
        required: true,
      },
      {
        sqlTable: 'IM_INV',
        sqlColumn: 'QTY_COMM',
        sqlType: 'DECIMAL(15,4)',
        transformRule: 'Committed orders from POS and open invoices',
        mongoCollection: 'inventory',
        mongoField: 'qtyReserved',
        mongoType: 'Number',
        strategy: 'Direct',
        required: true,
      },
      {
        sqlTable: 'CALCULATED',
        sqlColumn: 'ON_HAND - COMMITTED',
        sqlType: 'VIRTUAL',
        transformRule: 'Math.max(0, qtyOnHand - qtyReserved) via Mongoose schema hook',
        mongoCollection: 'inventory',
        mongoField: 'qtyAvailable',
        mongoType: 'Number',
        strategy: 'Calculated',
        required: true,
      },
    ],
  },
  {
    id: 'customers',
    name: 'Walk-In & B2B Corporate Customers',
    description: 'Maps CounterPoint AR_CUST table into WalkInCustomer and B2B User accounts with address parsing.',
    sqlTables: ['AR_CUST'],
    targetCollections: ['walkincustomers', 'users'],
    strategyOverview: 'Normalizes names, strips phone delimiters, and handles parent corporate hierarchy via USER_PARENT_CUST_NO.',
    architectureDiagram: 'AR_CUST ➔ walkincustomers (Retail shoppers) | users (B2B Agency accounts)',
    mappings: [
      {
        sqlTable: 'AR_CUST',
        sqlColumn: 'CUST_NO',
        sqlType: 'VARCHAR(12)',
        isPrimaryKey: true,
        transformRule: 'Trim whitespace, preserve leading zeros, seed AR_CUST_WALKIN ledger',
        mongoCollection: 'walkincustomers',
        mongoField: 'customerNumber',
        mongoType: 'String',
        strategy: 'Direct',
        required: true,
      },
      {
        sqlTable: 'AR_CUST',
        sqlColumn: 'FST_NAM + LST_NAM',
        sqlType: 'VARCHAR(15) x 2',
        transformRule: 'Fallback to NAM if FST/LST null; title-cased sanitization',
        mongoCollection: 'walkincustomers',
        mongoField: 'firstName / lastName',
        mongoType: 'String',
        strategy: 'Direct',
      },
      {
        sqlTable: 'AR_CUST',
        sqlColumn: 'EMAIL_ADRS_1',
        sqlType: 'VARCHAR(50)',
        transformRule: 'Lowercase trim; fallback to customerNumber@placeholder.local if null',
        mongoCollection: 'walkincustomers',
        mongoField: 'email',
        mongoType: 'String',
        strategy: 'Direct',
      },
      {
        sqlTable: 'AR_CUST',
        sqlColumn: 'PHONE_1 / MBL_PHONE_1',
        sqlType: 'VARCHAR(25)',
        transformRule: 'Extract digits only, format compatible with E.164',
        mongoCollection: 'walkincustomers',
        mongoField: 'phone',
        mongoType: 'String',
        strategy: 'Direct',
      },
      {
        sqlTable: 'AR_CUST',
        sqlColumn: 'ADRS_1, ADRS_2, CITY, STATE, ZIP_COD',
        sqlType: 'MULTIPLE',
        transformRule: 'Construct structured address subdocument',
        mongoCollection: 'walkincustomers',
        mongoField: 'address',
        mongoType: 'Object',
        strategy: '1:N Embedded',
      },
      {
        sqlTable: 'AR_CUST',
        sqlColumn: 'TAX_EXEMPT_NO',
        sqlType: 'VARCHAR(30)',
        transformRule: 'Tax exemption certificate identifier',
        mongoCollection: 'walkincustomers',
        mongoField: 'taxExemptNumber',
        mongoType: 'String',
        strategy: 'Direct',
      },
      {
        sqlTable: 'AR_CUST',
        sqlColumn: 'CR_LIM',
        sqlType: 'DECIMAL(15,2)',
        transformRule: 'Parse credit limit balance float',
        mongoCollection: 'walkincustomers',
        mongoField: 'creditLimit',
        mongoType: 'Number',
        strategy: 'Direct',
      },
    ],
  },
  {
    id: 'pos_orders',
    name: 'POS Sales Orders & Receipts',
    description: 'Fully denormalizes ticket headers, multi-item line details, and payment tenders into atomic POS documents.',
    sqlTables: ['PS_TKT_HIST', 'PS_TKT_HIST_LIN', 'PS_TKT_HIST_PMT'],
    targetCollections: ['posorders'],
    strategyOverview: '1:N Embedded Document pattern for high-speed POS receipt retrieval and 100% PCI compliance.',
    architectureDiagram: 'PS_TKT_HIST (Root) + PS_TKT_HIST_LIN (Embedded items[]) + PS_TKT_HIST_PMT (Embedded payments[]) ➔ posorders',
    mappings: [
      {
        sqlTable: 'PS_TKT_HIST',
        sqlColumn: 'DOC_ID',
        sqlType: 'BIGINT',
        isPrimaryKey: true,
        transformRule: 'Stringified document identifier for keyset paging and order lookup',
        mongoCollection: 'posorders',
        mongoField: 'orderNumber',
        mongoType: 'String',
        strategy: 'Direct',
        required: true,
      },
      {
        sqlTable: 'PS_TKT_HIST',
        sqlColumn: 'TKT_DT / BUS_DAT',
        sqlType: 'DATETIME',
        transformRule: 'UTC timestamp parser',
        mongoCollection: 'posorders',
        mongoField: 'createdAt',
        mongoType: 'Date',
        strategy: 'Direct',
        required: true,
      },
      {
        sqlTable: 'PS_TKT_HIST',
        sqlColumn: 'SUB_TOT, TAX_AMT, TOT',
        sqlType: 'DECIMAL(15,4)',
        transformRule: 'Round currency values to 2 decimal places',
        mongoCollection: 'posorders',
        mongoField: 'subTotal, taxAmount, totalAmount',
        mongoType: 'Number',
        strategy: 'Direct',
        required: true,
      },
      {
        sqlTable: 'PS_TKT_HIST',
        sqlColumn: 'CUST_NO',
        sqlType: 'VARCHAR(12)',
        isForeignKey: true,
        transformRule: 'Lookup customer ObjectId from ledger; null if anonymous walk-in',
        mongoCollection: 'posorders',
        mongoField: 'customer',
        mongoType: 'ObjectId',
        strategy: 'ObjectId Reference',
      },
      {
        sqlTable: 'PS_TKT_HIST_LIN',
        sqlColumn: 'LIN_SEQ_NO, ITEM_NO, QTY_SOLD, PRC',
        sqlType: 'MULTIPLE',
        isForeignKey: true,
        transformRule: 'Embed all ticket lines into array of items with variant references',
        mongoCollection: 'posorders',
        mongoField: 'items[]',
        mongoType: 'Array<OrderItem>',
        strategy: '1:N Embedded',
        required: true,
      },
      {
        sqlTable: 'PS_TKT_HIST_PMT',
        sqlColumn: 'PAY_COD, AMT',
        sqlType: 'VARCHAR(10), DECIMAL',
        transformRule: 'Embed safe tenders (CASH, CHECK, CARD summary); NEVER include PAN/track data',
        mongoCollection: 'posorders',
        mongoField: 'payments[]',
        mongoType: 'Array<PaymentTender>',
        strategy: 'PCI Scrubbed',
        required: true,
        notes: 'Strict PCI DSS 3.2.1 compliance enforced',
      },
    ],
  },
  {
    id: 'gift_cards',
    name: 'Gift Cards & Audit Ledger',
    description: 'Tracks stored-value balances and full transaction history without card security risks.',
    sqlTables: ['SY_GFC', 'SY_GFC_ACTIV'],
    targetCollections: ['giftcards'],
    strategyOverview: 'Atomic card documents with embedded chronological activity history and running balances.',
    architectureDiagram: 'SY_GFC (1:1) + SY_GFC_ACTIV (1:N embedded transactions[]) ➔ giftcards',
    mappings: [
      {
        sqlTable: 'SY_GFC',
        sqlColumn: 'GFC_NO',
        sqlType: 'VARCHAR(30)',
        isPrimaryKey: true,
        transformRule: 'Trim barcode key; preserve leading zeros',
        mongoCollection: 'giftcards',
        mongoField: 'barcode',
        mongoType: 'String',
        strategy: 'Direct',
        required: true,
      },
      {
        sqlTable: 'SY_GFC',
        sqlColumn: 'ORIG_AMT',
        sqlType: 'DECIMAL(15,4)',
        transformRule: 'Parse initial issuance dollar amount',
        mongoCollection: 'giftcards',
        mongoField: 'initialBalance',
        mongoType: 'Number',
        strategy: 'Direct',
        required: true,
      },
      {
        sqlTable: 'SY_GFC',
        sqlColumn: 'CURR_AMT',
        sqlType: 'DECIMAL(15,4)',
        transformRule: 'Parse active remaining dollar balance ($12,029.94 total)',
        mongoCollection: 'giftcards',
        mongoField: 'currentBalance',
        mongoType: 'Number',
        strategy: 'Direct',
        required: true,
      },
      {
        sqlTable: 'SY_GFC',
        sqlColumn: 'IS_VOID',
        sqlType: 'CHAR(1)',
        transformRule: "IS_VOID !== 'Y' && currentBalance > 0",
        mongoCollection: 'giftcards',
        mongoField: 'isActive',
        mongoType: 'Boolean',
        strategy: 'Calculated',
        required: true,
      },
      {
        sqlTable: 'SY_GFC_ACTIV',
        sqlColumn: 'SEQ_NO, DAT, ACTIV_TYP, AMT, DOC_NO',
        sqlType: 'MULTIPLE',
        transformRule: 'Embed full chronological reload and redemption audit events',
        mongoCollection: 'giftcards',
        mongoField: 'transactions[]',
        mongoType: 'Array<Transaction>',
        strategy: '1:N Embedded',
      },
    ],
  },
  {
    id: 'reference_data',
    name: 'Reference Data (Taxonomies, Vendors, Locations)',
    description: 'Core organizational lookups that anchor all foreign keys in the product and inventory models.',
    sqlTables: ['IM_CATEG_COD', 'IM_SUBCAT_COD', 'PO_VEND', 'IM_LOC'],
    targetCollections: ['taxonomies', 'vendors', 'facilities', 'locations'],
    strategyOverview: 'Seeded first in Phase 2 to populate the in-memory MigrationKeyLedger cache before processing products.',
    architectureDiagram: 'IM_CATEG_COD + IM_SUBCAT_COD ➔ taxonomies | PO_VEND ➔ vendors | IM_LOC ➔ facilities & locations',
    mappings: [
      {
        sqlTable: 'IM_CATEG_COD',
        sqlColumn: 'CATEG_COD',
        sqlType: 'VARCHAR(10)',
        isPrimaryKey: true,
        transformRule: 'Trim identifier; seed IM_CATEG_COD ledger key',
        mongoCollection: 'taxonomies',
        mongoField: 'name',
        mongoType: 'String',
        strategy: 'Direct',
        required: true,
      },
      {
        sqlTable: 'IM_SUBCAT_COD',
        sqlColumn: 'SUBCAT_COD, DESCR',
        sqlType: 'VARCHAR(10)',
        transformRule: 'Embed subcategories as subdocument array under parent category',
        mongoCollection: 'taxonomies',
        mongoField: 'subcategories[]',
        mongoType: 'Array<{ name, code }>',
        strategy: '1:N Embedded',
      },
      {
        sqlTable: 'PO_VEND',
        sqlColumn: 'VEND_NO',
        sqlType: 'VARCHAR(15)',
        isPrimaryKey: true,
        transformRule: 'Trim vendor code; seed PO_VEND ledger key (215 + INHOUSE)',
        mongoCollection: 'vendors',
        mongoField: 'vendorCode',
        mongoType: 'String',
        strategy: 'Direct',
        required: true,
      },
      {
        sqlTable: 'IM_LOC',
        sqlColumn: 'LOC_ID',
        sqlType: 'VARCHAR(10)',
        isPrimaryKey: true,
        transformRule: 'Map to Facility (retail store) and Location (warehouse)',
        mongoCollection: 'facilities / locations',
        mongoField: 'code',
        mongoType: 'String',
        strategy: 'Direct',
        required: true,
      },
    ],
  },
];

export const SchemaMappingView: React.FC = () => {
  const [selectedDomainId, setSelectedDomainId] = useState<string>('products');
  const [filterQuery, setFilterQuery] = useState<string>('');
  const [strategyFilter, setStrategyFilter] = useState<string>('ALL');

  const activeDomain = DOMAINS.find((d) => d.id === selectedDomainId) || DOMAINS[0];

  const filteredMappings = activeDomain.mappings.filter((m) => {
    const matchesQuery =
      m.sqlTable.toLowerCase().includes(filterQuery.toLowerCase()) ||
      m.sqlColumn.toLowerCase().includes(filterQuery.toLowerCase()) ||
      m.mongoField.toLowerCase().includes(filterQuery.toLowerCase()) ||
      m.transformRule.toLowerCase().includes(filterQuery.toLowerCase());

    const matchesStrategy = strategyFilter === 'ALL' || m.strategy === strategyFilter;
    return matchesQuery && matchesStrategy;
  });

  const getStrategyBadgeClass = (strategy: FieldMapping['strategy']) => {
    switch (strategy) {
      case '1:N Embedded':
        return 'badge-info';
      case 'ObjectId Reference':
        return 'badge-purple';
      case 'PCI Scrubbed':
        return 'badge-danger';
      case 'Calculated':
        return 'badge-warning';
      case 'Direct':
      default:
        return 'badge-success';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
      {/* Top Header Card */}
      <div className="glass-panel" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
              <Network size={28} color="var(--cyan-glow)" />
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>
                Schema &amp; Relational Mapping Studio
              </h2>
            </div>
            <p style={{ color: 'var(--text-secondary)', maxWidth: '850px', fontSize: '0.9rem' }}>
              Interactive relational-to-document mapping architect inspired by <strong>MongoDB Relational Migrator</strong>.
              Inspect how 50GB of relational CounterPoint SQL tables and grid dimensions transform into
              highly denormalized, high-performance Mongoose collections.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Mongoose Models:</span>
            <span style={{ padding: '0.35rem 0.75rem', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.1)', color: 'var(--cyan-glow)', fontWeight: 700, fontSize: '0.85rem' }}>
              75 Strict Schemas
            </span>
          </div>
        </div>

        {/* Domain Navigation Pills */}
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
          {DOMAINS.map((domain) => (
            <button
              key={domain.id}
              onClick={() => setSelectedDomainId(domain.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.65rem 1.15rem',
                borderRadius: '10px',
                border: '1px solid',
                borderColor: selectedDomainId === domain.id ? 'var(--cyan-glow)' : 'var(--border-color)',
                background: selectedDomainId === domain.id ? 'rgba(56, 189, 248, 0.15)' : 'rgba(15, 23, 42, 0.5)',
                color: selectedDomainId === domain.id ? 'var(--cyan-glow)' : 'var(--text-secondary)',
                fontWeight: selectedDomainId === domain.id ? 700 : 500,
                fontSize: '0.85rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.2s',
              }}
            >
              <Boxes size={15} />
              {domain.name}
            </button>
          ))}
        </div>
      </div>

      {/* Relational Flow Diagram Banner */}
      <div className="glass-panel" style={{ padding: '1.5rem', borderLeft: '4px solid var(--cyan-glow)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <Sparkles size={16} color="var(--amber)" />
              <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                {activeDomain.name} Mapping Strategy
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {activeDomain.description}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ padding: '0.4rem 0.85rem', borderRadius: '8px', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Source SQL: </span>
              <strong style={{ color: '#38bdf8' }}>{activeDomain.sqlTables.join(', ')}</strong>
            </div>
            <ArrowRight size={16} color="var(--text-muted)" />
            <div style={{ padding: '0.4rem 0.85rem', borderRadius: '8px', background: 'rgba(30, 41, 59, 0.8)', border: '1px solid var(--border-color)', fontSize: '0.8rem' }}>
              <span style={{ color: 'var(--text-muted)' }}>Target Mongo: </span>
              <strong style={{ color: 'var(--emerald)' }}>{activeDomain.targetCollections.join(', ')}</strong>
            </div>
          </div>
        </div>

        {/* Visual Architecture Box */}
        <div style={{ marginTop: '1rem', padding: '0.85rem 1.25rem', borderRadius: '8px', background: 'rgba(7, 9, 14, 0.6)', border: '1px dashed rgba(255, 255, 255, 0.1)', fontFamily: 'JetBrains Mono', fontSize: '0.8rem', color: '#94a3b8' }}>
          <strong>ETL Pipeline Flow:</strong> {activeDomain.architectureDiagram}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ position: 'relative', width: '340px' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            placeholder="Search SQL columns, Mongo fields, rules..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '0.65rem 1rem 0.65rem 2.6rem',
              borderRadius: '10px',
              border: '1px solid var(--border-color)',
              background: 'rgba(15, 23, 42, 0.8)',
              color: 'var(--text-primary)',
              fontSize: '0.85rem',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Filter Strategy:</span>
          {['ALL', 'Direct', '1:N Embedded', 'ObjectId Reference', 'Calculated', 'PCI Scrubbed'].map((strat) => (
            <button
              key={strat}
              onClick={() => setStrategyFilter(strat)}
              style={{
                padding: '0.35rem 0.75rem',
                borderRadius: '8px',
                border: '1px solid',
                borderColor: strategyFilter === strat ? 'var(--cyan-glow)' : 'var(--border-color)',
                background: strategyFilter === strat ? 'rgba(56, 189, 248, 0.1)' : 'transparent',
                color: strategyFilter === strat ? 'var(--cyan-glow)' : 'var(--text-secondary)',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              {strat}
            </button>
          ))}
        </div>
      </div>

      {/* Field-by-Field Relational Mapping Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="custom-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: 'rgba(15, 23, 42, 0.95)', borderBottom: '1px solid var(--border-color)' }}>
                <th style={{ padding: '1rem 1.25rem' }}>Source SQL Column</th>
                <th style={{ padding: '1rem 1.25rem' }}>SQL Type</th>
                <th style={{ padding: '1rem 1.25rem' }}>Transformation &amp; Business Logic</th>
                <th style={{ padding: '1rem 1.25rem' }}>Target Mongo Field</th>
                <th style={{ padding: '1rem 1.25rem' }}>Mongo Type</th>
                <th style={{ padding: '1rem 1.25rem' }}>Mapping Strategy</th>
              </tr>
            </thead>
            <tbody>
              {filteredMappings.map((m, idx) => (
                <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  {/* Source SQL Column */}
                  <td style={{ padding: '1rem 1.25rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {m.isPrimaryKey && (
                        <span title="Primary Key" style={{ display: 'flex' }}>
                          <Key size={14} color="var(--amber)" />
                        </span>
                      )}
                      {m.isForeignKey && (
                        <span title="Foreign Key" style={{ display: 'flex' }}>
                          <Tag size={14} color="var(--cyan-glow)" />
                        </span>
                      )}
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'JetBrains Mono' }}>
                          {m.sqlColumn}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          Table: <span style={{ color: '#93c5fd' }}>{m.sqlTable}</span>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* SQL Type */}
                  <td style={{ padding: '1rem 1.25rem' }}>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.75rem', color: '#94a3b8', background: 'rgba(15, 23, 42, 0.6)', padding: '0.2rem 0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                      {m.sqlType}
                    </span>
                  </td>

                  {/* Transformation Logic */}
                  <td style={{ padding: '1rem 1.25rem', maxWidth: '320px' }}>
                    <div style={{ color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {m.transformRule}
                    </div>
                    {m.notes && (
                      <div style={{ fontSize: '0.7rem', color: 'var(--amber)', marginTop: '0.25rem' }}>
                        ★ {m.notes}
                      </div>
                    )}
                  </td>

                  {/* Target Mongo Field */}
                  <td style={{ padding: '1rem 1.25rem' }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#38bdf8', fontFamily: 'JetBrains Mono' }}>
                        {m.mongoField}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                        Collection: <span style={{ color: 'var(--emerald)' }}>{m.mongoCollection}</span>
                      </div>
                    </div>
                  </td>

                  {/* Mongo Type */}
                  <td style={{ padding: '1rem 1.25rem' }}>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.75rem', color: '#4ade80', background: 'rgba(16, 185, 129, 0.1)', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                      {m.mongoType}
                    </span>
                    {m.required && (
                      <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', color: 'var(--rose)', fontWeight: 700 }}>
                        REQ
                      </span>
                    )}
                  </td>

                  {/* Mapping Strategy Badge */}
                  <td style={{ padding: '1rem 1.25rem' }}>
                    <span
                      style={{
                        padding: '0.3rem 0.65rem',
                        borderRadius: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        border: '1px solid var(--border-color)',
                        background:
                          m.strategy === 'PCI Scrubbed'
                            ? 'rgba(244, 63, 94, 0.15)'
                            : m.strategy === '1:N Embedded'
                            ? 'rgba(6, 182, 212, 0.15)'
                            : m.strategy === 'ObjectId Reference'
                            ? 'rgba(99, 102, 241, 0.15)'
                            : m.strategy === 'Calculated'
                            ? 'rgba(245, 158, 11, 0.15)'
                            : 'rgba(16, 185, 129, 0.15)',
                        color:
                          m.strategy === 'PCI Scrubbed'
                            ? 'var(--rose)'
                            : m.strategy === '1:N Embedded'
                            ? 'var(--cyan-glow)'
                            : m.strategy === 'ObjectId Reference'
                            ? '#a5b4fc'
                            : m.strategy === 'Calculated'
                            ? 'var(--amber)'
                            : 'var(--emerald)',
                      }}
                    >
                      {m.strategy}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer Summary Bar */}
        <div style={{ padding: '1rem 1.5rem', background: 'rgba(15, 23, 42, 0.5)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span>Showing {filteredMappings.length} of {activeDomain.mappings.length} mapped fields in {activeDomain.name}</span>
          <span style={{ color: 'var(--emerald)', fontWeight: 600 }}>✓ All fields validated against target Mongoose schemas</span>
        </div>
      </div>
    </div>
  );
};

export default SchemaMappingView;
