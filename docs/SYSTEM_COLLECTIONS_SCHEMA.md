# IMS Database Collection Structure & CounterPoint Migration Reference

Schema review date: **2026-10-27**. The current Mongoose definitions in `server/src/models/` are the source of truth for persisted fields and allowed values. TypeScript interfaces, older documentation and proposed source mappings can differ from the actual schema.

This reference documents the central MongoDB collections and POS Electron NeDB datastores. Generating it changes documentation only; it does not modify a database, import records, or create indexes.

## Corrections and recently covered values

- `Inventory` explicitly uses collection **`inventory`**, not `inventories`. Physical placement uses `InventoryLocation` (`inventorylocations`), `Location`, and `Facility`.
- `Variant.masterSku` is globally unique; `{ vendorId, sku }` is also unique. It identifies a variant, not its parent product. `additionalBarcodes`, `manufacturerItemNo` and `additionalAttributes` are persisted fields.
- `Inventory` is unique by `{ vendorId, vendorSku }` and by `masterSku`. Its pre-validation hook calculates `qtyAvailable = Math.max(0, qtyOnHand - qtyReserved - qtyAllocated)`. An import must explicitly reconcile source availability rather than assume a saved value survives this hook. `InventoryLocation.quantity` has minimum 1; negative or zero source stock needs a deliberate policy.
- `CustomerMeasurement` uses `ownerId` and `ownerModel` (`User` or `WalkInCustomer`), with nested `footwear`, `apparel` and `customFields`. It does not declare the former flat neck/chest/inseam field list.
- `GiftCard` uses `barcode`, `isActive` and transaction history. It does not declare `cardNumber`, a status enum or `expirationDate`.
- `Invoice.companyType` permits `portal`, `walkin` and `both`. `Contract.status` permits `draft`, `active`, `expired` and `cancelled`.
- `Allotment.type` permits lowercase `money` and `unit`; `periodType` and the separate money/unit configurations are documented below. `Credit`, `GroupAllotment` and customer allocation models have their own shapes and must not be treated as the same schema.
- Current `Order` and `PosOrder` fields include fitting review, fulfillment, pickup/signature and voucher-related data. The nested field tables give exact declarations and enum values. `VoucherPickupRecord` and `VoucherEvidenceAsset` are separate collections; evidence assets include immutable metadata and `pending`, `committed`, `deleting` states.
- The reference now includes vendor purchasing, receiving, stocking, stock movements, reservations, overrides, audit logs, portal configuration and supporting collections that were omitted from the earlier overview.

## CounterPoint source mapping boundaries

These are source domains to investigate, not approval to execute an import or a claim that the existing importer handles every table.

| CounterPoint source | IMS destination/domain | Mapping requirement |
| --- | --- | --- |
| `IM_ITEM`, `IM_BARCOD`, `IM_PRC` | Product, Variant, Attribute | Exact item/cell keys; item-specific dimension tags; barcode ambiguity, units and location pricing policies |
| `IM_INV`, `IM_INV_CELL`, `IM_LOC` | Inventory, InventoryLocation, Location, Facility | Reconcile item vs cell totals, negative quantities, commitments and location mapping before applying stock |
| `IM_CATEG_COD`, `IM_SUBCAT_COD` | Taxonomy / product category fields | Resolve category identifiers and names against the actual category representation |
| `PO_VEND`, `PO_VEND_ITEM` | Vendor / product-vendor links | Preserve vendor numbers; review collisions with existing vendor catalogs |
| `AR_CUST` | WalkInCustomer / corporate domain | Profile `CUST_TYP`, `CUST_NAM_TYP` and parent links; approve customer classification and corporate relationships |
| `PS_TKT_HIST`, `PS_TKT_HIST_LIN`, discounts and taxes | Historical sales / PosOrder | Verify source composite keys and transaction semantics; avoid live checkout side effects |
| `AR_OPN_ITEM`, applications and terms | A/R history / Invoice domain | Reconcile balances and application signs; IMS invoices are not a generic CounterPoint A/R ledger |
| `PS_DRW_CLS_HIST` and report sources | CounterPointReportArchive / POSSession domain | Confirm report columns and shift/session mapping |
| Purchase orders, receivers, voids and gift-card sources | Corresponding domain, after review | Definitions alone do not establish a compatible migration mapping |

### Rules required for migration scripts

1. Preserve original identifiers as strings, including leading zeros, case, meaningful spaces and full composite-key components. Use an explicit source-to-target key ledger where the destination schema has no legacy-key field. Names, email addresses and ticket numbers alone are not safe universal upsert keys.
2. Resolve `DIM_1_UPR`, `DIM_2_UPR`, `DIM_3_UPR` using that item's `GRID_DIM_1_TAG`, `GRID_DIM_2_TAG`, `GRID_DIM_3_TAG`. Do not assume size/color/length order. Retain original tags and values for dimensions such as Hand, Finish, Neck and Sleeve; review typo aliases individually.
3. Customer type is a source code that requires profiling. Do not treat `CUST_TYP != P` as proof of a business account or translate A/R balance/credit limit directly into allotment allowance.
4. Use an isolated test database and dry-run reports first. Idempotent upserts must use verified source keys and account for target unique indexes. Reconcile source counts, sums, orphan links, duplicate barcodes and rejected rows. Production writes require explicit approval.
5. Apply strict payment-data exclusion. Do not copy card numbers (including masked values), track data, CVV/PIN data, payment tokens, authorization codes, credentials or unrestricted payment/raw payloads into documents, migration logs, `receiptData` or `rawData`. This document describes field existence; a `Mixed` field is not permission to store source rows. Any permitted historical tender summaries need a separate, explicit allowlist and review. Gift-card credentials/identifiers also need a reviewed policy.
6. Do not feed historical tickets through live checkout endpoints that deduct stock, consume allotments, or trigger payment effects. Do not invent a `source` field on a strict schema; select a declared metadata location or use a separate migration ledger.
7. Preserve POS sync dependencies: server products/variants and required inventory references precede terminal catalog refresh; offline product and customer IDs must resolve before queued sales sync. Company data has a separate sync path. Do not write directly into terminal NeDB files or replace unsynced queues. Confirm generic dimensions and alternate barcodes survive normalization and are usable by the scanner before cutover.

## Reading this reference

The field tables below reflect declarations in the local checkout. They do not certify that a running cluster contains the same indexes or data. Inline unique/index flags and `.index()` definitions are documented separately; commented examples in `models/indexes.ts` are not applied indexes. Referenced-model names and collection naming overrides are reproduced as declared, including any inconsistencies that require code review.

## Source coverage

This snapshot covers **75 registered Mongoose models**, **2170 declared field paths**, and **23 named POS NeDB stores** (24 datastore declarations). Source digest: `1706d04b71d4f679a221c078fdd3e485e54738121539a598c649c8c6cc668b34`.

Generated from syntax without importing model/application code, reading environment files, querying records, or connecting to MongoDB. Collection names use explicit model/schema overrides or the installed Mongoose default pluralizer. This documents code declarations, not the indexes or schema of a running deployment.

Fields include nested object and array paths. Required flags apply to the containing subdocument; array element requirements do not by themselves require a nonempty array. Mongoose normally adds `_id` to documents/subdocuments and `__v` to root documents; `_id: false` and other overrides are shown in schema options or field constraints. `timestamps: true` adds `createdAt` and `updatedAt`. `Mixed` fields have no enforced child schema. Functions, hooks, virtuals and cross-field rules require the linked source; their bodies are not executed by this generator.

Refresh with `node server/scripts/generate-system-schema.cjs`. Verify without writing with `node server/scripts/generate-system-schema.cjs --check`. Edit migration guidance in `server/scripts/system-schema-notes.md`; the tables below are generated.

## Collection index

| Model | MongoDB collection | Declared field paths | Source |
| --- | --- | ---: | --- |
| [Alert](#model-alert) | `alerts` | 21 | [Model](server/src/models/Alert.model.ts) |
| [Allotment](#model-allotment) | `allotments` | 20 | [Model](server/src/models/Allotment.model.ts) |
| [Alteration](#model-alteration) | `alterations` | 21 | [Model](server/src/models/Alteration.model.ts) |
| [Attribute](#model-attribute) | `attributes` | 5 | [Model](server/src/models/Attribute.model.ts) |
| [BuyerEligibilityConfig](#model-buyereligibilityconfig) | `buyereligibilityconfigs` | 15 | [Model](server/src/models/BuyerEligibilityConfig.model.ts) |
| [Cashier](#model-cashier) | `cashiers` | 56 | [Model](server/src/models/cashier.model.ts) |
| [CashierRole](#model-cashierrole) | `cashierroles` | 27 | [Model](server/src/models/cashierRole.model.ts) |
| [CategoryLimit](#model-categorylimit) | `categorylimits` | 10 | [Model](server/src/models/CategoryLimit.model.ts) |
| [Conflict](#model-conflict) | `conflicts` | 7 | [Model](server/src/models/Conflict.model.ts) |
| [Contract](#model-contract) | `contracts` | 16 | [Model](server/src/models/Contract.model.ts) |
| [CounterPointMigration](#model-counterpointmigration) | `counterpointmigrations` | 15 | [Model](server/src/models/CounterPointMigration.model.ts) |
| [CounterPointReportArchive](#model-counterpointreportarchive) | `counterpointreportarchives` | 10 | [Model](server/src/models/CounterPointReportArchive.model.ts) |
| [Credit](#model-credit) | `credits` | 31 | [Model](server/src/models/Credit.model.ts) |
| [CustomColor](#model-customcolor) | `customcolors` | 2 | [Model](server/src/models/CustomColor.model.ts) |
| [CustomerAllocation](#model-customerallocation) | `customer_allocations` | 23 | [Model](server/src/models/CustomerAllocation.model.ts) |
| [CustomerMeasurement](#model-customermeasurement) | `customermeasurements` | 10 | [Model](server/src/models/CustomerMeasurement.model.ts) |
| [DiscrepancyReport](#model-discrepancyreport) | `discrepancy_reports` | 47 | [Model](server/src/models/DiscrepancyReport.model.ts) |
| [DocumentSequence](#model-documentsequence) | `documentsequences` | 3 | [Model](server/src/models/DocumentSequence.model.ts) |
| [EmailProfile](#model-emailprofile) | `emailprofiles` | 11 | [Model](server/src/models/EmailProfile.model.ts) |
| [EmployeeGroup](#model-employeegroup) | `employeegroups` | 14 | [Model](server/src/models/EmployeeGroup.model.ts) |
| [Facility](#model-facility) | `facilities` | 17 | [Model](server/src/models/Facility.model.ts) |
| [GiftCard](#model-giftcard) | `giftcards` | 13 | [Model](server/src/models/GiftCard.model.ts) |
| [GroupAllotment](#model-groupallotment) | `groupallotments` | 10 | [Model](server/src/models/GroupAllotment.model.ts) |
| [GroupProductAssignment](#model-groupproductassignment) | `groupproductassignments` | 13 | [Model](server/src/models/GroupProductAssignment.model.ts) |
| [Image](#model-image) | `images` | 15 | [Model](server/src/models/Image.model.ts) |
| [InhouseImport](#model-inhouseimport) | `inhouseimports` | 6 | [Model](server/src/models/InhouseImport.model.ts) |
| [Inventory](#model-inventory) | `inventory` | 35 | [Model](server/src/models/Inventory.model.ts) |
| [InventoryLocation](#model-inventorylocation) | `inventorylocations` | 15 | [Model](server/src/models/InventoryLocation.model.ts) |
| [Invoice](#model-invoice) | `invoices` | 53 | [Model](server/src/models/Invoice.model.ts) |
| [InvoiceCounter](#model-invoicecounter) | `invoicecounters` | 2 | [Model](server/src/models/InvoiceCounter.model.ts) |
| [Location](#model-location) | `locations` | 42 | [Model](server/src/models/Location.model.ts) |
| [MandatoryAlteration](#model-mandatoryalteration) | `mandatoryalterations` | 29 | [Model](server/src/models/MandatoryAlteration.model.ts) |
| [ManufacturerBackorder](#model-manufacturerbackorder) | `manufacturer_backorders` | 17 | [Model](server/src/models/ManufacturerBackorder.model.ts) |
| [MappingCache](#model-mappingcache) | `mappingcaches` | 2 | [Model](server/src/models/MappingCache.model.ts) |
| [Note](#model-note) | `notes` | 11 | [Model](server/src/models/Note.model.ts) |
| [Order](#model-order) | `orders` | 149 | [Model](server/src/models/Order.model.ts) |
| [OrderApproval](#model-orderapproval) | `orderapprovals` | 22 | [Model](server/src/models/OrderApproval.model.ts) |
| [OverrideAuditLog](#model-overrideauditlog) | `overrideauditlogs` | 14 | [Model](server/src/models/OverrideAuditLog.model.ts) |
| [OverrideRequest](#model-overriderequest) | `overriderequests` | 36 | [Model](server/src/models/OverrideRequest.model.ts) |
| [Package](#model-package) | `packages` | 31 | [Model](server/src/models/Package.model.ts) |
| [Page](#model-page) | `pages` | 121 | [Model](server/src/models/Page.model.ts) |
| [PO](#model-po) | `pos` | 11 | [Model](server/src/models/PO.model.ts) |
| [PortalAuditLog](#model-portalauditlog) | `portalauditlogs` | 5 | [Model](server/src/models/PortalAuditLog.model.ts) |
| [PosOrder](#model-posorder) | `posorders` | 179 | [Model](server/src/models/PosOrder.model.ts) |
| [PosOrderOperation](#model-posorderoperation) | `posorderoperations` | 179 | [Model](server/src/models/PosOrderOperation.model.ts) |
| [POSSession](#model-possession) | `possessions` | 49 | [Model](server/src/models/POSSession.model.ts) |
| [Product](#model-product) | `products` | 34 | [Model](server/src/models/Product.model.ts) |
| [ReceivingShipment](#model-receivingshipment) | `receiving_shipments` | 55 | [Model](server/src/models/ReceivingShipment.model.ts) |
| [ReplenishmentTrigger](#model-replenishmenttrigger) | `replenishment_triggers` | 25 | [Model](server/src/models/ReplenishmentTrigger.model.ts) |
| [ReportPreset](#model-reportpreset) | `reportpresets` | 15 | [Model](server/src/models/ReportPreset.model.ts) |
| [Reservation](#model-reservation) | `reservations` | 8 | [Model](server/src/models/Reservation.model.ts) |
| [Return](#model-return) | `returns` | 10 | [Model](server/src/models/Return.model.ts) |
| [SaleRule](#model-salerule) | `salerules` | 16 | [Model](server/src/models/SaleRule.model.ts) |
| [SizeFit](#model-sizefit) | `sizefits` | 5 | [Model](server/src/models/SizeFit.model.ts) |
| [SizeScale](#model-sizescale) | `sizescales` | 9 | [Model](server/src/models/SizeScale.model.ts) |
| [StockingTask](#model-stockingtask) | `stocking_tasks` | 41 | [Model](server/src/models/StockingTask.model.ts) |
| [StockingTransaction](#model-stockingtransaction) | `stocking_transactions` | 22 | [Model](server/src/models/StockingTransaction.model.ts) |
| [StockMovement](#model-stockmovement) | `stockmovements` | 38 | [Model](server/src/models/StockMovement.model.ts) |
| [SyncLog](#model-synclog) | `synclogs` | 16 | [Model](server/src/models/SyncLog.model.ts) |
| [SyncRunDetail](#model-syncrundetail) | `syncrundetails` | 11 | [Model](server/src/models/SyncRunDetail.model.ts) |
| [SystemSettings](#model-systemsettings) | `systemsettings` | 28 | [Model](server/src/models/SystemSettings.model.ts) |
| [Taxonomy](#model-taxonomy) | `taxonomies` | 9 | [Model](server/src/models/Taxonomy.model.ts) |
| [TicketAdjustment](#model-ticketadjustment) | `ticketadjustments` | 11 | [Model](server/src/models/TicketAdjustment.model.ts) |
| [User](#model-user) | `users` | 80 | [Model](server/src/models/User.model.ts) |
| [UserTenantRelationship](#model-usertenantrelationship) | `usertenantrelationships` | 7 | [Model](server/src/models/UserTenantRelationship.model.ts) |
| [Variant](#model-variant) | `variants` | 33 | [Model](server/src/models/Variant.model.ts) |
| [Vendor](#model-vendor) | `vendors` | 87 | [Model](server/src/models/Vendor.model.ts) |
| [VendorMapping](#model-vendormapping) | `vendormappings` | 17 | [Model](server/src/models/VendorMapping.model.ts) |
| [VendorPurchaseOrder](#model-vendorpurchaseorder) | `vendor_purchase_orders` | 66 | [Model](server/src/models/VendorPurchaseOrder.model.ts) |
| [VendorUser](#model-vendoruser) | `vendorusers` | 20 | [Model](server/src/models/VendorUser.model.ts) |
| [VoucherEvidenceAsset](#model-voucherevidenceasset) | `voucherevidenceassets` | 15 | [Model](server/src/models/VoucherEvidenceAsset.model.ts) |
| [VoucherPickupRecord](#model-voucherpickuprecord) | `voucherpickuprecords` | 4 | [Model](server/src/models/VoucherPickupRecord.model.ts) |
| [WalkInAllotmentHistory](#model-walkinallotmenthistory) | `walkinallotmenthistories` | 15 | [Model](server/src/models/WalkInAllotmentHistory.model.ts) |
| [WalkInContractPrice](#model-walkincontractprice) | `walkincontractprices` | 8 | [Model](server/src/models/WalkInContractPrice.model.ts) |
| [WalkInCustomer](#model-walkincustomer) | `walkincustomers` | 25 | [Model](server/src/models/WalkInCustomer.model.ts) |

## MongoDB field definitions

<a id="model-alert"></a>
### Alert (`alerts`)

Source: [server/src/models/Alert.model.ts](server/src/models/Alert.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `type` | `String (enum)` | `required: true; enum: ["lowStock", "conflict", "expiring", "custom", "replenishment"]; index: true` |
| `name` | `String` | `required: true; trim: true` |
| `description` | `String` | `default: ""` |
| `deepLink` | `String` | `default: null` |
| `vendorId` | `String` | `default: null; index: true` |
| `triggerIds` | `Array<String>` | `default: []` |
| `threshold` | `Number` | `default: null` |
| `condition` | `Object` | `—` |
| `condition.field` | `String` | `—` |
| `condition.operator` | `String (enum)` | `enum: ["lt", "lte", "gt", "gte", "eq"]` |
| `condition.value` | `Mixed` | `—` |
| `recipients` | `Array<String>` | `required: true; validate: { validator: function (v: string[]) { return v && v.length > 0; }, message: "At least one recipient is required", }` |
| `notificationChannels` | `Array<String>` | `default: ["email"]; enum: ["email", "sms", "webhook"]` |
| `scope` | `Object` | `—` |
| `scope.vendorId` | `String` | `default: null` |
| `scope.productId` | `String` | `default: null` |
| `webhookUrl` | `String` | `default: null; validate: { validator: function (v: string) { if (!v) return true; return /^https?:\/\/.+/.test(v); }, message: "Invalid webhook URL", }` |
| `active` | `Boolean` | `default: true; index: true` |
| `lastTriggered` | `Date` | `default: null` |
| `triggerCount` | `Number` | `default: 0` |
| `createdBy` | `String` | `default: null` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ active: 1, type: 1 }`

<a id="model-allotment"></a>
### Allotment (`allotments`)

Source: [server/src/models/Allotment.model.ts](server/src/models/Allotment.model.ts). Schema options: `{ timestamps: true, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `pageId` | `ObjectId` | `required: [true, "pageId is required"]; ref: "Page"; unique: true; index: true; sparse: false` |
| `type` | `String (enum)` | `required: true; default: "unit"; enum: ["money", "unit"]; index: true` |
| `periodType` | `String (enum)` | `required: true; default: "yearly"; enum: ["yearly", "quarterly", "monthly", "custom"]` |
| `customPeriodDays` | `Number` | `min: 1; validate: { validator: function (this: IAllotment, value: number) { if (this.periodType === PeriodType.CUSTOM) { return value !== undefined && value > 0; } return true; }, message: "customPeriodDays is required for CUSTOM period type", }` |
| `moneyConfig` | `Object` | `—` |
| `moneyConfig.totalAllowance` | `Number` | `min: 0` |
| `moneyConfig.currency` | `String` | `default: "USD"; uppercase: true` |
| `moneyConfig.carryForward` | `Boolean` | `default: false` |
| `moneyConfig.maxCarryForward` | `Number` | `min: 0` |
| `unitConfig` | `Object` | `—` |
| `unitConfig.totalUnits` | `Number` | `min: 0` |
| `unitConfig.unitName` | `String` | `default: "units"; trim: true` |
| `unitConfig.carryForward` | `Boolean` | `default: false` |
| `unitConfig.maxCarryForward` | `Number` | `min: 0` |
| `categoryLimits` | `Array` | `—` |
| `categoryLimits[].categoryId` | `ObjectId` | `ref: "Taxonomy"` |
| `categoryLimits[].subcategoryName` | `String` | `trim: true; lowercase: true` |
| `categoryLimits[].maxUnits` | `Number` | `required: true; min: 0` |
| `categoryLimits[].priority` | `Number` | `required: true; default: 0` |
| `isActive` | `Boolean` | `default: true; index: true` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ pageId: 1 }, { unique: true, sparse: false }`
- `{ type: 1 }`
- `{ periodType: 1 }`
- `{ isActive: 1 }`

Middleware declarations: `pre("save") in server/src/models/Allotment.model.ts at line 189`; `pre("save") in server/src/models/Allotment.model.ts at line 197`; `pre("save") in server/src/models/Allotment.model.ts at line 218`.

<a id="model-alteration"></a>
### Alteration (`alterations`)

Source: [server/src/models/Alteration.model.ts](server/src/models/Alteration.model.ts). Schema options: `{ timestamps: true, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `name` | `String` | `required: [true, "Alteration name is required"]; maxlength: [200, "Name cannot exceed 200 characters"]; trim: true` |
| `description` | `String` | `maxlength: [2000, "Description cannot exceed 2000 characters"]; trim: true` |
| `category` | `String` | `trim: true` |
| `subcategory` | `String` | `trim: true; lowercase: true` |
| `brand` | `String` | `trim: true` |
| `price` | `Number` | `required: [true, "Price is required"]; default: 0; min: [0, "Price cannot be negative"]` |
| `images` | `Array<String>` | `default: []` |
| `customInputFields` | `Array` | `default: []` |
| `customInputFields[].id` | `String` | `required: true` |
| `customInputFields[].type` | `String (enum)` | `required: true; enum: ["label", "input"]` |
| `customInputFields[].inputType` | `String (enum)` | `enum: ["text", "textarea", "number", "select"]` |
| `customInputFields[].label` | `String` | `required: true; maxlength: 200; trim: true` |
| `customInputFields[].placeholder` | `String` | `maxlength: 200; trim: true` |
| `customInputFields[].isRequired` | `Boolean` | `default: true` |
| `customInputFields[].options` | `Array<String>` | `—` |
| `customInputFields[].validationRegex` | `String` | `—` |
| `customInputFields[].minLength` | `Number` | `—` |
| `customInputFields[].maxLength` | `Number` | `—` |
| `customInputFields[].min` | `Number` | `—` |
| `customInputFields[].max` | `Number` | `—` |
| `isActive` | `Boolean` | `default: true; index: true` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ name: "text", description: "text" }`
- `{ category: 1 }`
- `{ isActive: 1, createdAt: -1 }`

<a id="model-attribute"></a>
### Attribute (`attributes`)

Source: [server/src/models/Attribute.model.ts](server/src/models/Attribute.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `name` | `String` | `required: true; unique: true; index: true; trim: true; lowercase: true` |
| `values` | `Array` | `—` |
| `values[]` | `String` | `trim: true; lowercase: true` |
| `attributeType` | `String (enum)` | `default: "select"; enum: ["text", "number", "boolean", "select"]` |
| `isRequired` | `Boolean` | `default: false` |

Middleware declarations: `pre("save") in server/src/models/Attribute.model.ts at line 37`.

<a id="model-buyereligibilityconfig"></a>
### BuyerEligibilityConfig (`buyereligibilityconfigs`)

Source: [server/src/models/BuyerEligibilityConfig.model.ts](server/src/models/BuyerEligibilityConfig.model.ts). Schema options: `{ timestamps: true, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `pageId` | `ObjectId` | `required: true; ref: "Page"; unique: true; index: true` |
| `buyerMode` | `String (enum)` | `required: true; enum: ["ONLY_ADMIN_CAN_BUY", "EVERYONE_CAN_BUY", "EMPLOYEE_REQUIRES_ADMIN_APPROVAL"]; index: true` |
| `config` | `Object` | `—` |
| `config.approvalSettings` | `Object` | `required: false; _id: false` |
| `config.approvalSettings.autoApprove` | `Boolean` | `default: false` |
| `config.approvalSettings.approvalThreshold` | `Number` | `min: 0` |
| `config.approvalSettings.notifyAdmins` | `Boolean` | `default: true` |
| `config.approvalSettings.requiredApprovers` | `Number` | `default: 1; min: 1` |
| `config.allowedGroups` | `Array` | `—` |
| `config.allowedGroups[]` | `Schema.Types.ObjectId` | `ref: "EmployeeGroup"` |
| `config.restrictedGroups` | `Array` | `—` |
| `config.restrictedGroups[]` | `Schema.Types.ObjectId` | `ref: "EmployeeGroup"` |
| `config.minOrderAmount` | `Number` | `min: 0` |
| `config.maxOrderAmount` | `Number` | `min: 0` |
| `isActive` | `Boolean` | `default: true; index: true` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ pageId: 1 }, { unique: true }`
- `{ buyerMode: 1 }`
- `{ isActive: 1 }`

Middleware declarations: `pre("save") in server/src/models/BuyerEligibilityConfig.model.ts at line 136`; `pre("save") in server/src/models/BuyerEligibilityConfig.model.ts at line 147`.

<a id="model-cashier"></a>
### Cashier (`cashiers`)

Source: [server/src/models/cashier.model.ts](server/src/models/cashier.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `employeeId` | `String` | `unique: true; trim: true` |
| `badgeCode` | `String` | `index: true; sparse: true; trim: true` |
| `username` | `String` | `index: true; sparse: true; trim: true; lowercase: true` |
| `firstName` | `String` | `required: [true, "First name is required"]; trim: true` |
| `lastName` | `String` | `required: [true, "Last name is required"]; trim: true` |
| `displayName` | `String` | `trim: true` |
| `email` | `String` | `index: true; sparse: true; trim: true; lowercase: true` |
| `contact` | `String` | `trim: true` |
| `password` | `String` | `required: [true, "Password is required"]; select: false` |
| `vendorId` | `ObjectId` | `required: [true, "Vendor ID is required"]; ref: "Vendor"; index: true` |
| `counterNo` | `Number` | `required: [true, "Counter number is required"]` |
| `counterName` | `String` | `trim: true` |
| `hasCardMachine` | `Boolean` | `default: false` |
| `cardMachineId` | `String` | `trim: true` |
| `hasScanner` | `Boolean` | `default: true` |
| `scannerModel` | `String` | `trim: true` |
| `drawerCashLimit` | `Number` | `default: 0` |
| `openingFloat` | `Number` | `default: 0` |
| `role` | `String` | `default: 'cashier'; index: true` |
| `assignedManagerEmail` | `String` | `trim: true` |
| `storeManagerEmails` | `Array<String>` | `default: []` |
| `withPrivileges` | `Boolean` | `default: false` |
| `privileges` | `Subdocument` | `default: function (see source)` |
| `privileges.canApplyDiscount` | `Boolean` | `default: false` |
| `privileges.canVoidTransaction` | `Boolean` | `default: false` |
| `privileges.canIssueRefund` | `Boolean` | `default: false` |
| `privileges.canOverridePrice` | `Boolean` | `default: false` |
| `privileges.canViewReports` | `Boolean` | `default: false` |
| `privileges.canManageDrawer` | `Boolean` | `default: false` |
| `privileges.canManageClosingBalance` | `Boolean` | `default: false` |
| `privileges.canApplyGlobalDiscount` | `Boolean` | `default: false` |
| `privileges.canSuspendCart` | `Boolean` | `default: false` |
| `privileges.canProcessSales` | `Boolean` | `default: true` |
| `privileges.canReviewOrders` | `Boolean` | `default: false` |
| `privileges.canUseCompanyPortal` | `Boolean` | `default: false` |
| `privileges.canAddProduct` | `Boolean` | `default: false` |
| `privileges.canSeeWarehouseLocations` | `Boolean` | `default: false` |
| `privileges.canUpdateStock` | `Boolean` | `default: false` |
| `privileges.canAddCompanyToWalkIn` | `Boolean` | `default: false` |
| `privileges.canManageGiftCards` | `Boolean` | `default: false` |
| `privileges.canTailor` | `Boolean` | `default: false` |
| `privileges.maxDiscountPercent` | `Number` | `default: 0` |
| `isActive` | `Boolean` | `default: true; index: true` |
| `isFirstLogin` | `Boolean` | `default: true` |
| `passwordChangedAt` | `Date` | `—` |
| `lastLoginAt` | `Date` | `—` |
| `lastLoginIP` | `String` | `—` |
| `failedLoginAttempts` | `Number` | `default: 0` |
| `lockedUntil` | `Date` | `—` |
| `passwordResetToken` | `String` | `select: false` |
| `passwordResetExpiresAt` | `Date` | `select: false` |
| `isOnLeave` | `Boolean` | `default: false` |
| `leaveStartDate` | `Date` | `—` |
| `leaveEndDate` | `Date` | `—` |
| `leaveNotes` | `String` | `trim: true` |
| `employmentConfirmedAt` | `Date` | `—` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ email: 1, vendorId: 1 }`
- `{ vendorId: 1, isActive: 1 }`
- `{ vendorId: 1, counterNo: 1 }`

Middleware declarations: `pre("save") in server/src/models/cashier.model.ts at line 316`.

<a id="model-cashierrole"></a>
### CashierRole (`cashierroles`)

Source: [server/src/models/cashierRole.model.ts](server/src/models/cashierRole.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `vendorId` | `String` | `required: true; index: true` |
| `value` | `String` | `required: true; trim: true; lowercase: true` |
| `label` | `String` | `required: true; trim: true` |
| `description` | `String` | `default: ""` |
| `canAuthorizeOverrides` | `Boolean` | `default: false` |
| `isDefault` | `Boolean` | `default: false` |
| `privileges` | `Subdocument` | `default: function (see source)` |
| `privileges.canApplyDiscount` | `Boolean` | `default: false` |
| `privileges.canVoidTransaction` | `Boolean` | `default: false` |
| `privileges.canIssueRefund` | `Boolean` | `default: false` |
| `privileges.canOverridePrice` | `Boolean` | `default: false` |
| `privileges.canViewReports` | `Boolean` | `default: false` |
| `privileges.canManageDrawer` | `Boolean` | `default: false` |
| `privileges.canManageClosingBalance` | `Boolean` | `default: false` |
| `privileges.canApplyGlobalDiscount` | `Boolean` | `default: false` |
| `privileges.canSuspendCart` | `Boolean` | `default: false` |
| `privileges.canProcessSales` | `Boolean` | `default: true` |
| `privileges.canReviewOrders` | `Boolean` | `default: false` |
| `privileges.canUseCompanyPortal` | `Boolean` | `default: false` |
| `privileges.canAddProduct` | `Boolean` | `default: false` |
| `privileges.canSeeWarehouseLocations` | `Boolean` | `default: false` |
| `privileges.canUpdateStock` | `Boolean` | `default: false` |
| `privileges.canAddCompanyToWalkIn` | `Boolean` | `default: false` |
| `privileges.canManageGiftCards` | `Boolean` | `default: false` |
| `privileges.canTailor` | `Boolean` | `default: false` |
| `privileges.maxDiscountPercent` | `Number` | `default: 0` |
| `imsPermissions` | `Array<String>` | `default: []` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ vendorId: 1, value: 1 }, { unique: true }`

<a id="model-categorylimit"></a>
### CategoryLimit (`categorylimits`)

Source: [server/src/models/CategoryLimit.model.ts](server/src/models/CategoryLimit.model.ts). Schema options: `{ timestamps: true, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `pageId` | `ObjectId` | `required: true; ref: "Page"; index: true` |
| `allotmentId` | `ObjectId` | `ref: "Allotment"; index: true; sparse: true` |
| `categoryId` | `ObjectId` | `required: true; ref: "Taxonomy"; index: true` |
| `subcategoryName` | `String` | `index: true; trim: true; lowercase: true` |
| `limitType` | `String (enum)` | `required: true; enum: ["max_units", "max_amount", "max_percentage"]` |
| `limitValue` | `Number` | `required: true; min: 0` |
| `periodType` | `String (enum)` | `enum: ["yearly", "quarterly", "monthly", "custom"]` |
| `customPeriodDays` | `Number` | `min: 1` |
| `priority` | `Number` | `required: true; default: 0` |
| `isActive` | `Boolean` | `default: true; index: true` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ pageId: 1, categoryId: 1 }`
- `{ allotmentId: 1 }`
- `{ categoryId: 1 }`
- `{ pageId: 1, isActive: 1 }`
- `{ priority: -1 }`
- `{ pageId: 1, categoryId: 1, subcategoryName: 1, limitType: 1 }, { unique: true, sparse: true }`

Middleware declarations: `pre("save") in server/src/models/CategoryLimit.model.ts at line 119`.

<a id="model-conflict"></a>
### Conflict (`conflicts`)

Source: [server/src/models/Conflict.model.ts](server/src/models/Conflict.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `inventoryId` | `ObjectId` | `required: true; ref: "Inventory"` |
| `type` | `String (enum)` | `required: true; enum: ["qtyMismatch", "priceMismatch"]; index: true` |
| `details` | `Mixed` | `required: true; default: {}` |
| `resolved` | `Boolean` | `default: false; index: true` |
| `resolvedBy` | `String` | `default: null` |
| `resolvedAt` | `Date` | `default: null` |
| `notes` | `String` | `default: ""` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ resolved: 1, createdAt: -1 }`

Middleware declarations: `pre("save") in server/src/models/Conflict.model.ts at line 64`.

<a id="model-contract"></a>
### Contract (`contracts`)

Source: [server/src/models/Contract.model.ts](server/src/models/Contract.model.ts). Schema options: `{ timestamps: true, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `contractName` | `String` | `required: true; trim: true` |
| `contractorName` | `String` | `required: true; trim: true` |
| `contractWith` | `String` | `required: true; trim: true` |
| `description` | `String` | `trim: true` |
| `contractPeriod` | `Object` | `—` |
| `contractPeriod.startDate` | `Date` | `required: true` |
| `contractPeriod.endDate` | `Date` | `required: true` |
| `status` | `String (enum)` | `default: "draft"; enum: ["draft", "active", "expired", "cancelled"]` |
| `products` | `Array` | `—` |
| `products[].productId` | `ObjectId` | `required: true; ref: "Product"` |
| `products[].variants` | `Array` | `—` |
| `products[].variants[].variantId` | `ObjectId` | `required: true; ref: "Variant"` |
| `products[].variants[].contractPrice` | `Number` | `required: true; min: 0` |
| `portalIds` | `Array` | `—` |
| `portalIds[]` | `Schema.Types.ObjectId` | `ref: "Page"` |
| `createdBy` | `ObjectId` | `required: true; ref: "User"` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ status: 1 }`
- `{ "products.productId": 1 }`
- `{ portalIds: 1 }`

<a id="model-counterpointmigration"></a>
### CounterPointMigration (`counterpointmigrations`)

Source: [server/src/models/CounterPointMigration.model.ts](server/src/models/CounterPointMigration.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `batchId` | `String` | `required: true; unique: true; index: true` |
| `module` | `String (enum)` | `required: true; enum: [ "barcodes", "customers", "company_customers", "sales_history", "invoices", "reports", "other_data", ]; index: true` |
| `fileName` | `String` | `default: "counterpoint_export.csv"` |
| `totalRecords` | `Number` | `default: 0` |
| `successfulRecords` | `Number` | `default: 0` |
| `warningRecords` | `Number` | `default: 0` |
| `failedRecords` | `Number` | `default: 0` |
| `skippedRecords` | `Number` | `default: 0` |
| `records` | `Array` | `—` |
| `records[].identifier` | `String` | `required: true` |
| `records[].status` | `String (enum)` | `required: true; enum: ["success", "warning", "error", "skipped"]` |
| `records[].message` | `String` | `required: true` |
| `records[].rawData` | `Mixed` | `—` |
| `records[].importedAt` | `Date` | `default: Date.now` |
| `executedBy` | `String` | `default: "System Admin"` |

<a id="model-counterpointreportarchive"></a>
### CounterPointReportArchive (`counterpointreportarchives`)

Source: [server/src/models/CounterPointReportArchive.model.ts](server/src/models/CounterPointReportArchive.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `reportId` | `String` | `required: true; index: true` |
| `reportName` | `String` | `required: true` |
| `reportType` | `String` | `default: "EOD_ZOUT"; index: true` |
| `periodStart` | `Date` | `—` |
| `periodEnd` | `Date` | `—` |
| `totalSales` | `Number` | `default: 0` |
| `taxCollected` | `Number` | `default: 0` |
| `transactionCount` | `Number` | `default: 0` |
| `notes` | `String` | `default: ""` |
| `rawData` | `Mixed` | `—` |

<a id="model-credit"></a>
### Credit (`credits`)

Source: [server/src/models/Credit.model.ts](server/src/models/Credit.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `userId` | `ObjectId` | `required: true; ref: "User"; index: true` |
| `pageId` | `ObjectId` | `required: true; ref: "Page"; index: true` |
| `groupId` | `ObjectId` | `required: false; ref: "EmployeeGroup"; index: true` |
| `totalAllocated` | `Number` | `default: 0; min: 0` |
| `totalUsed` | `Number` | `default: 0; min: 0` |
| `balance` | `Number` | `default: 0; min: 0` |
| `categoryLimits` | `Map` | `default: function (see source); of: AllotmentLimitSchema` |
| `subcategoryLimits` | `Map` | `default: function (see source); of: AllotmentLimitSchema` |
| `productLimits` | `Map` | `default: function (see source); of: AllotmentLimitSchema` |
| `periodStartDate` | `Date` | `—` |
| `periodEndDate` | `Date` | `—` |
| `lastRolloverDate` | `Date` | `—` |
| `transactions` | `Array` | `—` |
| `transactions[].type` | `String (enum)` | `required: true; enum: ["allocation", "purchase", "refund", "adjustment", "expired", "rollover"]` |
| `transactions[].amount` | `Number` | `required: true` |
| `transactions[].balance` | `Number` | `required: true` |
| `transactions[].description` | `String` | `—` |
| `transactions[].referenceId` | `String` | `—` |
| `transactions[].reversesTransaction` | `Subdocument` | `default: undefined` |
| `transactions[].reversesTransaction.referenceId` | `String` | `required: true` |
| `transactions[].reversesTransaction.createdAt` | `Date` | `required: true` |
| `transactions[].categoryId` | `ObjectId` | `ref: "Taxonomy"` |
| `transactions[].subcategoryName` | `String` | `—` |
| `transactions[].productId` | `ObjectId` | `ref: "Product"` |
| `transactions[].createdBy` | `ObjectId` | `ref: "User"` |
| `transactions[].createdAt` | `Date` | `default: Date.now` |
| `carryForward` | `Boolean` | `default: false` |
| `maxCarryForward` | `Number` | `min: 0` |
| `isActive` | `Boolean` | `default: true` |
| `isFrozen` | `Boolean` | `default: false` |
| `isUnlimited` | `Boolean` | `default: false` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ userId: 1, pageId: 1, groupId: 1 }, { unique: true }`
- `{ pageId: 1, isActive: 1 }`
- `{ "transactions.createdAt": -1 }`

Middleware declarations: `pre("save") in server/src/models/Credit.model.ts at line 1368`.

<a id="model-customcolor"></a>
### CustomColor (`customcolors`)

Source: [server/src/models/CustomColor.model.ts](server/src/models/CustomColor.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `name` | `String` | `required: true; unique: true; trim: true; set: function (see source)` |
| `hex` | `String` | `required: true; trim: true` |

<a id="model-customerallocation"></a>
### CustomerAllocation (`customer_allocations`)

Source: [server/src/models/CustomerAllocation.model.ts](server/src/models/CustomerAllocation.model.ts). Schema options: `{ timestamps: true, collection: "customer_allocations", }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `allocationNumber` | `String` | `unique: true; sparse: true; trim: true; uppercase: true` |
| `sourceType` | `String (enum)` | `required: true; enum: ["portal_order", "pos_order"]; index: true` |
| `sourceOrderId` | `ObjectId` | `required: true; index: true` |
| `orderReference` | `String` | `required: true; index: true; trim: true` |
| `customerId` | `ObjectId` | `ref: "User"; index: true` |
| `customerName` | `String` | `default: ""` |
| `customerEmail` | `String` | `default: null; trim: true; lowercase: true` |
| `customerPhone` | `String` | `default: null; trim: true` |
| `variantId` | `ObjectId` | `required: true; ref: "Variant"` |
| `sku` | `String` | `required: true; index: true; trim: true; uppercase: true` |
| `productName` | `String` | `default: ""` |
| `poId` | `ObjectId` | `default: null; ref: "VendorPurchaseOrder"; index: true` |
| `poNumber` | `String` | `default: null; index: true; trim: true; uppercase: true` |
| `receivingShipmentId` | `ObjectId` | `default: null; ref: "ReceivingShipment"` |
| `allocatedLocationId` | `ObjectId` | `default: null; ref: "InventoryLocation"` |
| `binCode` | `String` | `default: null; trim: true; uppercase: true` |
| `boxCode` | `String` | `default: null; trim: true; uppercase: true` |
| `requestedQty` | `Number` | `required: true; min: 1` |
| `allocatedQty` | `Number` | `default: 0; min: 0` |
| `receivedQty` | `Number` | `default: 0; min: 0` |
| `stockedQty` | `Number` | `default: 0; min: 0` |
| `status` | `String (enum)` | `default: "unassigned"; enum: ["unassigned", "on_order", "dock_received", "stocked_locked", "fulfilled", "cancelled"]; index: true` |
| `notes` | `String` | `default: ""` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ variantId: 1, status: 1 }`
- `{ poId: 1, status: 1 }`
- `{ sourceOrderId: 1, variantId: 1 }`

<a id="model-customermeasurement"></a>
### CustomerMeasurement (`customermeasurements`)

Source: [server/src/models/CustomerMeasurement.model.ts](server/src/models/CustomerMeasurement.model.ts). Schema options: `{ timestamps: true, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `ownerId` | `ObjectId` | `required: true; refPath: "ownerModel"` |
| `ownerModel` | `String (enum)` | `required: true; enum: ["User", "WalkInCustomer"]` |
| `footwear` | `Object` | `—` |
| `footwear.system` | `String` | `—` |
| `footwear.value` | `String` | `—` |
| `apparel` | `Object` | `—` |
| `apparel.shirtSize` | `String` | `—` |
| `apparel.pantWaist` | `Number` | `—` |
| `apparel.pantLength` | `Number` | `—` |
| `customFields` | `Map` | `default: {}; of: String` |

<a id="model-discrepancyreport"></a>
### DiscrepancyReport (`discrepancy_reports`)

Source: [server/src/models/DiscrepancyReport.model.ts](server/src/models/DiscrepancyReport.model.ts). Schema options: `{ timestamps: true, collection: "discrepancy_reports", }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `reportNumber` | `String` | `required: true; unique: true; index: true; trim: true; uppercase: true` |
| `poId` | `ObjectId` | `required: true; ref: "VendorPurchaseOrder"; index: true` |
| `poNumber` | `String` | `required: true; index: true; trim: true; uppercase: true` |
| `shipmentId` | `ObjectId` | `required: true; ref: "ReceivingShipment"; index: true` |
| `shipmentNumber` | `String` | `required: true; index: true; trim: true; uppercase: true` |
| `vendorId` | `String` | `required: true; ref: "Vendor"; index: true` |
| `vendorName` | `String` | `default: ""` |
| `packingSlipNumber` | `String` | `default: ""; trim: true` |
| `items` | `Array` | `—` |
| `items[].variantId` | `ObjectId` | `required: true; ref: "Variant"` |
| `items[].sku` | `String` | `required: true; trim: true; uppercase: true` |
| `items[].productName` | `String` | `default: ""` |
| `items[].discrepancyType` | `String (enum)` | `required: true; enum: ["shortage", "overage", "damage", "wrong_item"]` |
| `items[].expectedQty` | `Number` | `required: true` |
| `items[].receivedQty` | `Number` | `required: true` |
| `items[].discrepancyQty` | `Number` | `required: true` |
| `items[].unitCost` | `Number` | `default: 0; min: 0` |
| `items[].totalDiscrepancyValue` | `Number` | `default: 0; min: 0` |
| `items[].photoUrls` | `Array` | `—` |
| `items[].photoUrls[]` | `String` | `—` |
| `items[].notes` | `String` | `default: ""` |
| `totalDiscrepancyValue` | `Number` | `default: 0; min: 0` |
| `photoProofUrls` | `Array` | `—` |
| `photoProofUrls[]` | `String` | `—` |
| `status` | `String (enum)` | `default: "open"; enum: [ "open", "vendor_contacted", "credit_requested", "replacement_shipped", "resolved", "dismissed", ]; index: true` |
| `resolution` | `Object` | `—` |
| `resolution.action` | `String (enum)` | `default: null; enum: ["credit_memo", "replacement", "write_off", "other", null]` |
| `resolution.creditMemoNumber` | `String` | `default: null` |
| `resolution.creditAmount` | `Number` | `default: null` |
| `resolution.creditMemoDocumentUrl` | `String` | `default: null` |
| `resolution.carrier` | `String` | `default: null` |
| `resolution.trackingNumber` | `String` | `default: null` |
| `resolution.replacementEta` | `Date` | `default: null` |
| `resolution.replacementShipmentId` | `ObjectId` | `default: null; ref: "ReceivingShipment"` |
| `resolution.replacementShipmentNumber` | `String` | `default: null` |
| `resolution.resolvedAt` | `Date` | `default: null` |
| `resolution.resolvedBy` | `String` | `default: null` |
| `resolution.notes` | `String` | `default: ""` |
| `emailHistory` | `Array` | `—` |
| `emailHistory[].sentAt` | `Date` | `default: Date.now` |
| `emailHistory[].recipient` | `String` | `required: true` |
| `emailHistory[].subject` | `String` | `required: true` |
| `emailHistory[].body` | `String` | `default: ""` |
| `emailHistory[].attachments` | `Array` | `—` |
| `emailHistory[].attachments[]` | `String` | `—` |
| `emailHistory[].sentBy` | `String` | `default: "IMS Staff"` |
| `notes` | `String` | `default: ""` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ vendorId: 1, status: 1 }`
- `{ shipmentId: 1, status: 1 }`

Middleware declarations: `pre("save") in server/src/models/DiscrepancyReport.model.ts at line 157`.

<a id="model-documentsequence"></a>
### DocumentSequence (`documentsequences`)

Source: [server/src/models/DocumentSequence.model.ts](server/src/models/DocumentSequence.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `docType` | `String` | `required: true` |
| `year` | `Number` | `required: true` |
| `seq` | `Number` | `default: 0` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ docType: 1, year: 1 }, { unique: true }`

<a id="model-emailprofile"></a>
### EmailProfile (`emailprofiles`)

Source: [server/src/models/EmailProfile.model.ts](server/src/models/EmailProfile.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `name` | `String` | `required: true; trim: true` |
| `receivableEmail` | `String` | `trim: true; lowercase: true` |
| `smtp` | `Object` | `—` |
| `smtp.host` | `String` | `trim: true` |
| `smtp.port` | `Number` | `—` |
| `smtp.secure` | `Boolean` | `default: true` |
| `smtp.user` | `String` | `trim: true` |
| `smtp.encryptedPassword` | `String` | `—` |
| `smtp.from` | `String` | `trim: true` |
| `assignedPortals` | `Array` | `—` |
| `assignedPortals[]` | `Schema.Types.ObjectId` | `ref: "Page"` |

<a id="model-employeegroup"></a>
### EmployeeGroup (`employeegroups`)

Source: [server/src/models/EmployeeGroup.model.ts](server/src/models/EmployeeGroup.model.ts). Schema options: `{ timestamps: true, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `name` | `String` | `required: true; index: true; maxlength: 200; trim: true` |
| `code` | `String` | `sparse: true; trim: true; uppercase: true` |
| `description` | `String` | `maxlength: 500` |
| `pageId` | `ObjectId` | `required: true; ref: "Page"; index: true` |
| `employeeIds` | `Array` | `—` |
| `employeeIds[]` | `Schema.Types.ObjectId` | `ref: "User"; required: true` |
| `source` | `String (enum)` | `required: true; default: "manual"; enum: ["csv_import", "manual", "auto_created"]; index: true` |
| `sourceReference` | `ObjectId` | `ref: "CSVImport"; sparse: true` |
| `assignedCategories` | `Array` | `—` |
| `assignedCategories[].categoryId` | `ObjectId` | `required: true; ref: "Taxonomy"` |
| `assignedCategories[].categoryName` | `String` | `required: true` |
| `assignedCategories[].subcategories` | `Array<String>` | `—` |
| `metadata` | `Map` | `of: Schema.Types.Mixed` |
| `isActive` | `Boolean` | `default: true; index: true` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ pageId: 1, isActive: 1 }`
- `{ employeeIds: 1 }`
- `{ source: 1 }`
- `{ pageId: 1, name: 1 }`
- `{ pageId: 1, name: 1 }, { unique: true }`

Middleware declarations: `pre("save") in server/src/models/EmployeeGroup.model.ts at line 149`.

<a id="model-facility"></a>
### Facility (`facilities`)

Source: [server/src/models/Facility.model.ts](server/src/models/Facility.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `facilityId` | `String` | `required: true; unique: true; index: true; trim: true` |
| `name` | `String` | `required: true; trim: true` |
| `code` | `String` | `required: true; trim: true; uppercase: true` |
| `type` | `String (enum)` | `default: "main"; enum: ["main", "warehouse", "retail_store", "satellite", "other"]` |
| `address` | `Object` | `—` |
| `address.street` | `String` | `default: ""` |
| `address.city` | `String` | `default: ""` |
| `address.state` | `String` | `default: ""` |
| `address.country` | `String` | `default: ""` |
| `address.zipCode` | `String` | `default: ""` |
| `contact` | `Object` | `—` |
| `contact.phone` | `String` | `default: ""` |
| `contact.email` | `String` | `default: ""` |
| `contact.managerName` | `String` | `default: ""` |
| `isPrimary` | `Boolean` | `default: false` |
| `isActive` | `Boolean` | `default: true; index: true` |
| `notes` | `String` | `default: ""` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ name: 1 }`
- `{ code: 1 }`

<a id="model-giftcard"></a>
### GiftCard (`giftcards`)

Source: [server/src/models/GiftCard.model.ts](server/src/models/GiftCard.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `barcode` | `String` | `required: true; unique: true; index: true; trim: true` |
| `initialBalance` | `Number` | `required: true; default: 0` |
| `currentBalance` | `Number` | `required: true; default: 0` |
| `isActive` | `Boolean` | `default: true` |
| `transactions` | `Array` | `—` |
| `transactions[].type` | `String (enum)` | `required: true; enum: ["issue", "redemption", "reload", "void"]` |
| `transactions[].amount` | `Number` | `required: true` |
| `transactions[].balanceAfter` | `Number` | `required: true` |
| `transactions[].referenceId` | `String` | `—` |
| `transactions[].cashierName` | `String` | `—` |
| `transactions[].paymentMethod` | `String` | `—` |
| `transactions[].notes` | `String` | `—` |
| `transactions[].createdAt` | `Date` | `default: Date.now` |

<a id="model-groupallotment"></a>
### GroupAllotment (`groupallotments`)

Source: [server/src/models/GroupAllotment.model.ts](server/src/models/GroupAllotment.model.ts). Schema options: `{ timestamps: true, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `pageId` | `ObjectId` | `required: true; ref: "Page"; index: true` |
| `groupId` | `ObjectId` | `required: true; ref: "EmployeeGroup"; index: true` |
| `type` | `String (enum)` | `required: true; enum: ["product", "category", "subcategory"]` |
| `productId` | `ObjectId` | `ref: "Product"` |
| `categoryId` | `ObjectId` | `ref: "Taxonomy"` |
| `subcategoryName` | `String` | `trim: true` |
| `allotmentValue` | `Number` | `required: true; min: 0` |
| `isUnlimited` | `Boolean` | `default: false` |
| `priority` | `Number` | `required: true; default: 0` |
| `isActive` | `Boolean` | `default: true` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ groupId: 1, type: 1, categoryId: 1, subcategoryName: 1 }`
- `{ groupId: 1, type: 1, productId: 1 }`

<a id="model-groupproductassignment"></a>
### GroupProductAssignment (`groupproductassignments`)

Source: [server/src/models/GroupProductAssignment.model.ts](server/src/models/GroupProductAssignment.model.ts). Schema options: `{ timestamps: true, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `pageId` | `ObjectId` | `required: true; ref: "Page"; index: true` |
| `employeeGroupId` | `ObjectId` | `required: true; ref: "EmployeeGroup"; index: true` |
| `assignmentType` | `String (enum)` | `required: true; enum: ["product", "category", "subcategory"]; index: true` |
| `productId` | `ObjectId` | `ref: "Product"; index: true; sparse: true` |
| `categoryId` | `ObjectId` | `ref: "Taxonomy"; index: true; sparse: true` |
| `subcategoryName` | `String` | `sparse: true; trim: true; lowercase: true` |
| `mandatoryAlterations` | `Array` | `—` |
| `mandatoryAlterations[]` | `{ type: String, enum: ["product", "alteration"], required: true, }` | `productId: { type: Schema.Types.ObjectId, ref: "Product", sparse: true, }; alterationId: { type: Schema.Types.ObjectId, ref: "Alteration", sparse: true, }; customInputFields: { type: [Schema.Types.Mixed], default: [], }; isRequired: { type: Boolean, default: true, }; minQuantity: { type: Number, min: 0, default: 1, }; maxQuantity: { type: Number, min: 1, }` |
| `mandatoryAlterations[].type` | `String` | `—` |
| `mandatoryAlterations[].enum` | `Array` | `—` |
| `mandatoryAlterations[].required` | `true` | `—` |
| `allowedColors` | `Array<String>` | `default: []` |
| `isActive` | `Boolean` | `default: true; index: true` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ pageId: 1, employeeGroupId: 1 }`
- `{ employeeGroupId: 1, isActive: 1 }`
- `{ productId: 1 }`
- `{ categoryId: 1 }`
- `{ pageId: 1, isActive: 1 }`
- `{ pageId: 1, employeeGroupId: 1, productId: 1, assignmentType: 1 }, { unique: true, sparse: true, partialFilterExpression: { assignmentType: AssignmentType.PRODUCT }, }`
- `{ pageId: 1, employeeGroupId: 1, categoryId: 1, assignmentType: 1 }, { unique: true, sparse: true, partialFilterExpression: { assignmentType: AssignmentType.CATEGORY }, }`
- `{ pageId: 1, employeeGroupId: 1, categoryId: 1, subcategoryName: 1, assignmentType: 1, }, { unique: true, sparse: true, partialFilterExpression: { assignmentType: AssignmentType.SUBCATEGORY }, }`

Middleware declarations: `pre("save") in server/src/models/GroupProductAssignment.model.ts at line 209`.

<a id="model-image"></a>
### Image (`images`)

Source: [server/src/models/Image.model.ts](server/src/models/Image.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `productId` | `ObjectId` | `required: true; ref: "Product"` |
| `variantId` | `ObjectId` | `ref: "Variant"` |
| `urls` | `Array` | `—` |
| `urls[]` | `String` | `required: true` |
| `thumbnailUrl` | `String` | `default: null` |
| `optimizedUrl` | `String` | `default: null` |
| `alt` | `String` | `default: ""` |
| `order` | `Number` | `default: 0` |
| `dimensions` | `Object` | `—` |
| `dimensions.width` | `Number` | `—` |
| `dimensions.height` | `Number` | `—` |
| `fileSize` | `Number` | `default: 0` |
| `format` | `String (enum)` | `default: "jpg"; enum: ["jpg", "jpeg", "png", "webp", "gif"]` |
| `metadata` | `Mixed` | `default: {}` |
| `isPrimary` | `Boolean` | `default: false` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ productId: 1 }`
- `{ productId: 1, variantId: 1 }`

Middleware declarations: `pre("save") in server/src/models/Image.model.ts at line 62`.

<a id="model-inhouseimport"></a>
### InhouseImport (`inhouseimports`)

Source: [server/src/models/InhouseImport.model.ts](server/src/models/InhouseImport.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `jobId` | `String` | `required: true; unique: true; index: true` |
| `records` | `Array<Schema.Types.Mixed>` | `required: true` |
| `createdBy` | `String` | `default: null` |
| `status` | `String (enum)` | `default: "PENDING"; enum: ["PENDING", "PROCESSING", "SUCCESS", "FAILED"]` |
| `result` | `Mixed` | `—` |
| `error` | `String` | `default: null` |

<a id="model-inventory"></a>
### Inventory (`inventory`)

Source: [server/src/models/Inventory.model.ts](server/src/models/Inventory.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `productId` | `ObjectId` | `required: true; ref: "Product"; index: true` |
| `variantId` | `ObjectId` | `ref: "Variant"; index: true; sparse: true` |
| `vendorId` | `String` | `required: true; ref: "Vendor"` |
| `vendorSku` | `String` | `required: true; index: true; uppercase: true` |
| `masterSku` | `String` | `required: true; uppercase: true` |
| `origin` | `String (enum)` | `default: "vendor"; enum: ["vendor", "inhouse"]; index: true` |
| `syncType` | `String (enum)` | `default: "api"; enum: ["api", "csv", "ftp", "inhouse"]` |
| `location` | `Object` | `—` |
| `location.warehouseId` | `String` | `index: true` |
| `location.binCode` | `String` | `—` |
| `location.boxId` | `String` | `—` |
| `qtyOnHand` | `Number` | `default: 0` |
| `qtyAvailable` | `Number` | `default: 0` |
| `qtyReserved` | `Number` | `default: 0` |
| `posCheckoutOperations` | `Array<String>` | `default: undefined` |
| `qtyOnOrder` | `Number` | `default: 0; min: 0` |
| `qtyBackordered` | `Number` | `default: 0; min: 0` |
| `qtyAllocated` | `Number` | `default: 0; min: 0` |
| `minQty` | `Number` | `default: null; min: 0` |
| `maxQty` | `Number` | `default: null; min: 0` |
| `targetQty` | `Number` | `default: null; min: 0` |
| `manufacturerItemNo` | `String` | `default: null; trim: true; uppercase: true` |
| `uom` | `String` | `default: "EA"; trim: true` |
| `moq` | `Number` | `default: 1; set: function (see source)` |
| `packingRules` | `Mixed` | `default: {}` |
| `costPrice` | `Number` | `default: 0; min: 0` |
| `lastSyncDate` | `Date` | `—` |
| `createdBy` | `String` | `default: null` |
| `vendorRawData` | `Mixed` | `default: {}` |
| `upc` | `String` | `index: true; sparse: true` |
| `map` | `Number` | `default: 0; min: 0` |
| `customerSpecificPrice` | `Number` | `default: 0; min: 0` |
| `extra_1` | `String` | `default: null` |
| `extra_2` | `String` | `default: null` |
| `extra_3` | `String` | `default: null` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ vendorId: 1, vendorSku: 1 }, { unique: true }`
- `{ masterSku: 1 }, { unique: true, sparse: true }`
- `{ vendorId: 1, qtyAvailable: 1 }`
- `{ vendorId: 1, manufacturerItemNo: 1 }, { sparse: true }`
- `{ qtyOnHand: 1 }`
- `{ minQty: 1, qtyOnHand: 1 }`
- `{ qtyBackordered: 1 }`
- `{ variantId: 1, qtyOnHand: 1 }`
- `{ variantId: 1, minQty: 1 }`
- `{ qtyAvailable: 1, minQty: 1 }`

Middleware declarations: `pre("validate") in server/src/models/Inventory.model.ts at line 152`; `pre("save") in server/src/models/Inventory.model.ts at line 159`.

<a id="model-inventorylocation"></a>
### InventoryLocation (`inventorylocations`)

Source: [server/src/models/InventoryLocation.model.ts](server/src/models/InventoryLocation.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `inventoryId` | `ObjectId` | `required: true; ref: "Inventory"; index: true` |
| `variantId` | `ObjectId` | `ref: "Variant"; index: true` |
| `warehouseId` | `String` | `required: true; index: true` |
| `binId` | `String` | `required: true; index: true` |
| `boxId` | `String` | `default: null; index: true` |
| `quantity` | `Number` | `required: true; min: 1` |
| `posCheckoutOperations` | `Array<String>` | `default: undefined` |
| `isCustomerAllocated` | `Boolean` | `default: false; index: true` |
| `allocatedQty` | `Number` | `default: 0; min: 0` |
| `customerAllocations` | `Array` | `—` |
| `customerAllocations[].orderId` | `ObjectId` | `ref: "Order"` |
| `customerAllocations[].orderNumber` | `String` | `—` |
| `customerAllocations[].customerId` | `ObjectId` | `ref: "User"` |
| `customerAllocations[].customerName` | `String` | `—` |
| `customerAllocations[].qty` | `Number` | `required: true; min: 1` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ warehouseId: 1, binId: 1, boxId: 1 }`

<a id="model-invoice"></a>
### Invoice (`invoices`)

Source: [server/src/models/Invoice.model.ts](server/src/models/Invoice.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `invoiceNumber` | `String` | `required: true; unique: true` |
| `companyName` | `String` | `required: true` |
| `companyType` | `String (enum)` | `required: true; enum: ['portal', 'walkin', 'both']` |
| `portalId` | `ObjectId` | `ref: 'Page'` |
| `portalName` | `String` | `—` |
| `groupId` | `ObjectId` | `ref: 'EmployeeGroup'` |
| `groupName` | `String` | `—` |
| `dateFrom` | `Date` | `required: true` |
| `dateTo` | `Date` | `required: true` |
| `invoiceDate` | `Date` | `required: true; default: Date.now` |
| `dueDate` | `Date` | `—` |
| `status` | `String (enum)` | `required: true; default: 'draft'; enum: ['draft', 'sent', 'paid', 'overdue']` |
| `totalOrders` | `Number` | `required: true` |
| `subtotal` | `Number` | `required: true` |
| `taxTotal` | `Number` | `required: true` |
| `grandTotal` | `Number` | `required: true` |
| `cashPaidTotal` | `Number` | `required: true` |
| `lineItems` | `Array` | `—` |
| `lineItems[].orderId` | `ObjectId` | `required: true; ref: 'PosOrder'` |
| `lineItems[].orderLocalId` | `String` | `required: true` |
| `lineItems[].poNumber` | `String` | `—` |
| `lineItems[].employeeName` | `String` | `required: true` |
| `lineItems[].employeeEmail` | `String` | `—` |
| `lineItems[].employeeGroup` | `String` | `default: 'N/A'` |
| `lineItems[].orderDate` | `Date` | `required: true` |
| `lineItems[].items` | `Array` | `—` |
| `lineItems[].items[].sku` | `String` | `required: true` |
| `lineItems[].items[].productName` | `String` | `required: true` |
| `lineItems[].items[].variantName` | `String` | `—` |
| `lineItems[].items[].qty` | `Number` | `required: true` |
| `lineItems[].items[].unitPrice` | `Number` | `required: true` |
| `lineItems[].items[].originalPrice` | `Number` | `—` |
| `lineItems[].items[].contractPrice` | `Number` | `—` |
| `lineItems[].items[].allotmentPerUnit` | `Number` | `required: true` |
| `lineItems[].items[].cashPerUnit` | `Number` | `required: true` |
| `lineItems[].items[].lineTotal` | `Number` | `required: true` |
| `lineItems[].orderSubtotal` | `Number` | `required: true` |
| `lineItems[].orderTax` | `Number` | `required: true` |
| `lineItems[].orderGrandTotal` | `Number` | `required: true` |
| `lineItems[].allotmentAmount` | `Number` | `required: true` |
| `lineItems[].cashPaidByEmployee` | `Number` | `required: true` |
| `lineItems[].paymentMethod` | `String` | `required: true` |
| `title` | `String` | `—` |
| `notes` | `String` | `—` |
| `emailLog` | `Array` | `—` |
| `emailLog[].sentTo` | `String` | `required: true` |
| `emailLog[].sentAt` | `Date` | `required: true; default: Date.now` |
| `emailLog[].sentBy` | `String` | `required: true` |
| `paidAt` | `Date` | `—` |
| `paidReference` | `String` | `—` |
| `paidNotes` | `String` | `—` |
| `createdBy` | `String` | `required: true` |
| `poNumber` | `String` | `—` |

<a id="model-invoicecounter"></a>
### InvoiceCounter (`invoicecounters`)

Source: [server/src/models/InvoiceCounter.model.ts](server/src/models/InvoiceCounter.model.ts). Schema options: `Mongoose defaults`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `year` | `Number` | `required: true; unique: true` |
| `lastSeq` | `Number` | `required: true; default: 0` |

<a id="model-location"></a>
### Location (`locations`)

Source: [server/src/models/Location.model.ts](server/src/models/Location.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `warehouseId` | `String` | `required: true; unique: true; index: true` |
| `warehouseName` | `String` | `required: true` |
| `facilityId` | `String` | `default: null; index: true` |
| `facilityName` | `String` | `default: ""` |
| `locationType` | `String (enum)` | `default: "warehouse"; enum: ["warehouse", "showroom", "hold", "storeroom", "tailor_shop", "other"]; index: true` |
| `canSellDirectly` | `Boolean` | `default: false` |
| `allowsReceiving` | `Boolean` | `default: true` |
| `isCustomerHold` | `Boolean` | `default: false` |
| `capacity` | `Number` | `default: 0` |
| `isUnlimitedCapacity` | `Boolean` | `default: false` |
| `address` | `Object` | `—` |
| `address.street` | `String` | `—` |
| `address.city` | `String` | `—` |
| `address.state` | `String` | `—` |
| `address.country` | `String` | `—` |
| `address.zipCode` | `String` | `—` |
| `posCheckoutOperations` | `Array<String>` | `default: undefined` |
| `bins` | `Array` | `—` |
| `bins[].binId` | `String` | `required: true` |
| `bins[].binCode` | `String` | `required: true` |
| `bins[].structureType` | `String (enum)` | `default: "bin"; enum: ["box", "shelf", "rack", "pallet", "bin", "peg", "drawer"]` |
| `bins[].aisle` | `String` | `—` |
| `bins[].side` | `String (enum)` | `default: "None"; enum: ["A", "B", "None"]` |
| `bins[].column` | `String` | `—` |
| `bins[].row` | `String` | `—` |
| `bins[].shelf` | `String` | `—` |
| `bins[].boxNumber` | `String` | `—` |
| `bins[].capacity` | `Number` | `default: 100` |
| `bins[].occupied` | `Number` | `default: 0` |
| `bins[].isUnlimitedCapacity` | `Boolean` | `default: false` |
| `bins[].capacityUnit` | `String` | `default: "units"` |
| `bins[].status` | `String (enum)` | `default: "active"; enum: ["active", "maintenance", "full"]` |
| `bins[].boxes` | `Array` | `—` |
| `bins[].boxes[].boxId` | `String` | `required: true` |
| `bins[].boxes[].boxNumber` | `Number` | `required: true` |
| `bins[].boxes[].boxCode` | `String` | `required: true` |
| `bins[].boxes[].fullAddress` | `String` | `required: true` |
| `bins[].boxes[].status` | `String (enum)` | `default: "empty"; enum: ["empty", "occupied"]` |
| `bins[].boxes[].itemCount` | `Number` | `default: 0` |
| `bins[].boxes[].notes` | `String` | `default: ""` |
| `bins[].boxes[].createdAt` | `Date` | `default: Date.now` |
| `isActive` | `Boolean` | `default: true` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ "bins.binCode": 1 }`
- `{ isActive: 1 }`

<a id="model-mandatoryalteration"></a>
### MandatoryAlteration (`mandatoryalterations`)

Source: [server/src/models/MandatoryAlteration.model.ts](server/src/models/MandatoryAlteration.model.ts). Schema options: `{ timestamps: true, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `pageId` | `ObjectId` | `required: true; ref: "Page"; index: true` |
| `name` | `String` | `required: true; maxlength: 200; trim: true` |
| `description` | `String` | `maxlength: 500` |
| `type` | `String (enum)` | `required: true; enum: ["product_based", "attribute_based"]; index: true` |
| `scope` | `String (enum)` | `required: true; default: "global"; enum: ["product", "category", "global"]; index: true` |
| `productBasedConfig` | `Object` | `—` |
| `productBasedConfig.productIds` | `Array` | `—` |
| `productBasedConfig.productIds[]` | `Schema.Types.ObjectId` | `ref: "Product"` |
| `productBasedConfig.isRequired` | `Boolean` | `default: true` |
| `productBasedConfig.minQuantity` | `Number` | `default: 1; min: 0` |
| `productBasedConfig.maxQuantity` | `Number` | `min: 1` |
| `attributeBasedConfig` | `Object` | `—` |
| `attributeBasedConfig.attributeKey` | `String` | `trim: true` |
| `attributeBasedConfig.attributeType` | `String (enum)` | `enum: ["text", "number", "select", "multiselect", "boolean"]` |
| `attributeBasedConfig.requiredValues` | `Array<String>` | `—` |
| `attributeBasedConfig.validationRule` | `String` | `—` |
| `attributeBasedConfig.defaultValue` | `Mixed` | `—` |
| `customInputFields` | `Array` | `—` |
| `customInputFields[]` | `{ type: String, enum: ["label", "input"], required: true, }` | `id: { type: String, required: true, }; inputType: { type: String, enum: Object.values(CustomInputFieldType), }; label: { type: String, required: true, trim: true, maxlength: 200, }; placeholder: { type: String, trim: true, maxlength: 200, }; isRequired: { type: Boolean, default: true, }; options: [String]; validationRegex: String; minLength: Number; maxLength: Number; min: Number; max: Number` |
| `customInputFields[].type` | `String` | `—` |
| `customInputFields[].enum` | `Array` | `—` |
| `customInputFields[].required` | `true` | `—` |
| `applicationRules` | `Object` | `—` |
| `applicationRules.autoAttach` | `Boolean` | `default: true` |
| `applicationRules.blockCheckout` | `Boolean` | `default: true` |
| `applicationRules.showInUI` | `Boolean` | `default: true` |
| `applicationRules.allowMultiple` | `Boolean` | `default: false` |
| `priority` | `Number` | `required: true; default: 0` |
| `isActive` | `Boolean` | `default: true; index: true` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ pageId: 1, type: 1 }`
- `{ pageId: 1, scope: 1 }`
- `{ pageId: 1, isActive: 1 }`
- `{ priority: -1 }`
- `{ "productBasedConfig.productIds": 1 }`

Middleware declarations: `pre("save") in server/src/models/MandatoryAlteration.model.ts at line 253`; `pre("save") in server/src/models/MandatoryAlteration.model.ts at line 280`.

<a id="model-manufacturerbackorder"></a>
### ManufacturerBackorder (`manufacturer_backorders`)

Source: [server/src/models/ManufacturerBackorder.model.ts](server/src/models/ManufacturerBackorder.model.ts). Schema options: `{ timestamps: true, collection: "manufacturer_backorders", }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `poId` | `ObjectId` | `required: true; ref: "VendorPurchaseOrder"; index: true` |
| `poNumber` | `String` | `required: true; index: true; trim: true; uppercase: true` |
| `vendorId` | `String` | `required: true; ref: "Vendor"; index: true` |
| `variantId` | `ObjectId` | `required: true; ref: "Variant"` |
| `sku` | `String` | `required: true; index: true; trim: true; uppercase: true` |
| `productName` | `String` | `default: ""` |
| `backorderedQty` | `Number` | `required: true; min: 1` |
| `expectedAvailabilityDate` | `Date` | `default: null; index: true` |
| `vendorReference` | `String` | `default: null; trim: true` |
| `status` | `String (enum)` | `default: "open"; enum: ["open", "received", "cancelled"]; index: true` |
| `etaHistory` | `Array` | `—` |
| `etaHistory[].oldEta` | `Date` | `default: null` |
| `etaHistory[].newEta` | `Date` | `required: true` |
| `etaHistory[].changedBy` | `String` | `default: "system"` |
| `etaHistory[].reason` | `String` | `default: ""` |
| `etaHistory[].timestamp` | `Date` | `default: Date.now` |
| `notes` | `String` | `default: ""` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ vendorId: 1, status: 1 }`
- `{ variantId: 1, status: 1 }`

<a id="model-mappingcache"></a>
### MappingCache (`mappingcaches`)

Source: [server/src/models/MappingCache.model.ts](server/src/models/MappingCache.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `vendorId` | `String` | `required: true; unique: true; index: true` |
| `fieldMappings` | `Map` | `of: { unified: String, confidence: Number, method: String, lastUsed: Date, }` |

<a id="model-note"></a>
### Note (`notes`)

Source: [server/src/models/Note.model.ts](server/src/models/Note.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `entityType` | `String` | `required: true; index: true; trim: true; lowercase: true` |
| `entityId` | `String` | `required: true; index: true; trim: true` |
| `content` | `String` | `required: true; trim: true` |
| `authorId` | `String` | `default: ""` |
| `authorName` | `String` | `required: true; default: "System User"; trim: true` |
| `authorRole` | `String` | `default: "Cashier"` |
| `isWarning` | `Boolean` | `default: false; index: true` |
| `priority` | `String (enum)` | `default: "medium"; enum: ["low", "medium", "high", "critical"]` |
| `tags` | `Array<String>` | `default: []` |
| `metadata` | `Mixed` | `default: {}` |
| `isArchived` | `Boolean` | `default: false; index: true` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ entityType: 1, entityId: 1, isArchived: 1, createdAt: -1 }`
- `{ entityType: 1, entityId: 1, isWarning: 1, isArchived: 1 }`

<a id="model-order"></a>
### Order (`orders`)

Source: [server/src/models/Order.model.ts](server/src/models/Order.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `posApproval` | `Mixed` | `—` |
| `inventoryFlow` | `String (enum)` | `enum: ["fitting_v1"]` |
| `stockShowroomId` | `String` | `—` |
| `posWorkflow` | `Mixed` | `—` |
| `voucherProcessing` | `Mixed` | `—` |
| `userId` | `ObjectId` | `required: true; ref: "User"; index: true` |
| `autoPurchaseOrder` | `String` | `required: true; unique: true; index: true` |
| `customPurchaseOrder` | `String` | `required: true; unique: true; index: true` |
| `orderedBy` | `Object` | `—` |
| `orderedBy.userId` | `ObjectId` | `ref: "User"` |
| `orderedBy.email` | `String` | `—` |
| `orderedBy.name` | `String` | `—` |
| `orderedFor` | `Object` | `—` |
| `orderedFor.userId` | `ObjectId` | `ref: "User"` |
| `orderedFor.email` | `String` | `—` |
| `orderedFor.name` | `String` | `—` |
| `orderedForGroup` | `ObjectId` | `ref: "EmployeeGroup"` |
| `pageId` | `ObjectId` | `ref: "Page"; index: true` |
| `pageSlug` | `String` | `—` |
| `purchasePermission` | `String (enum)` | `enum: ["admin_only", "everyone_with_approval", "everyone"]` |
| `allotmentType` | `String (enum)` | `enum: ["money", "unit"]; index: true` |
| `items` | `Array` | `—` |
| `items[].variantId` | `ObjectId` | `required: true; ref: "Variant"` |
| `items[].sku` | `String` | `required: true; uppercase: true` |
| `items[].qty` | `Number` | `required: true; min: 1` |
| `items[].price` | `Number` | `required: true; min: 0` |
| `items[].productName` | `String` | `trim: true` |
| `items[].vendorId` | `ObjectId` | `ref: "Vendor"` |
| `items[].size` | `String` | `trim: true` |
| `items[].color` | `String` | `trim: true; lowercase: true` |
| `items[].length` | `String` | `trim: true` |
| `items[].notes` | `String` | `trim: true` |
| `items[].alterations` | `Array<Schema.Types.Mixed>` | `default: undefined` |
| `items[].mandatoryAlterations` | `Array<Schema.Types.Mixed>` | `default: undefined` |
| `items[].alterationSkipped` | `Boolean` | `default: undefined` |
| `items[].alterationInputs` | `Mixed` | `—` |
| `items[].alterationNotes` | `String` | `trim: true` |
| `items[].fittingReview` | `Subdocument` | `default: undefined` |
| `items[].fittingReview.availability` | `String (enum)` | `required: true; enum: ["ready", "backorder", "hold"]` |
| `items[].fittingReview.requiresAlteration` | `Boolean` | `required: true` |
| `items[].fittingReview.completedAt` | `Date` | `—` |
| `items[].stockDeduction` | `Mixed` | `—` |
| `items[].fittingUnit` | `Mixed` | `—` |
| `items[].cartUnit` | `Mixed` | `—` |
| `items[].pickupCallConfirmedAt` | `Date` | `—` |
| `items[].pickupCallConfirmedBy` | `String` | `trim: true` |
| `items[].status` | `String` | `default: "pending"` |
| `items[].isUnlimitedPurchase` | `Boolean` | `default: false` |
| `items[].skipAlterations` | `Boolean` | `default: false` |
| `items[].itemType` | `String (enum)` | `default: "regular_sale"; enum: ["regular_sale", "order", "layaway", "backorder", "hold", "alteration_required"]` |
| `items[].itemStatus` | `String (enum)` | `default: "ordered"; enum: ["ordered", "backordered", "received", "in_alteration", "hold_section", "ready_for_pickup", "picked_up", "cancelled"]` |
| `items[].garmentStage` | `String (enum)` | `enum: ["pending", "embroidery", "tailoring", "hold_section", "picked_up", "cancelled"]` |
| `items[].fulfillment` | `Object` | `—` |
| `items[].fulfillment.fulfilledQty` | `Number` | `default: 0` |
| `items[].fulfillment.pendingQty` | `Number` | `default: 0` |
| `items[].fulfillment.fulfilledAt` | `Date` | `—` |
| `items[].fulfillment.pickedUpBy` | `String` | `—` |
| `items[].rackLocation` | `String` | `trim: true` |
| `items[].locationId` | `String` | `trim: true` |
| `items[].locationName` | `String` | `trim: true` |
| `items[].stagedAt` | `Date` | `—` |
| `items[].holdSectionAt` | `Date` | `—` |
| `items[].layawayDetails` | `Object` | `—` |
| `items[].layawayDetails.depositAmount` | `Number` | `—` |
| `items[].layawayDetails.balanceRemaining` | `Number` | `—` |
| `items[].layawayDetails.dueDate` | `Date` | `—` |
| `items[].layawayDetails.minimumDepositPercent` | `Number` | `default: 20` |
| `items[].oversizeSurcharge` | `Number` | `—` |
| `items[].isSizedGarment` | `Boolean` | `default: false` |
| `mandatoryAlterationItems` | `Array` | `—` |
| `mandatoryAlterationItems[]` | `{ type: String, enum: ["product", "service"], required: true }` | `variantId: { type: Schema.Types.ObjectId, ref: "Variant" }; sku: { type: String, uppercase: true }; qty: { type: Number, required: true, min: 1 }; price: { type: Number, min: 0 }; size: { type: String, trim: true }; color: { type: String, trim: true, lowercase: true }; productName: { type: String, trim: true }; parentItemVariantId: { type: Schema.Types.ObjectId, ref: "Variant" }; serviceProduct: { name: String, description: String, category: String, subcategory: String, brand: String, attributes: [Schema.Types.Mixed], }; customInputs: { type: Schema.Types.Mixed }; customInputFields: [ { id: String, type: { type: String, enum: ["label", "input"] }, inputType: { type: String, enum: ["text", "textarea", "number", "select"], }, label: String, placeholder: String, isRequired: Boolean, options: [String], }, ]` |
| `mandatoryAlterationItems[].type` | `String` | `—` |
| `mandatoryAlterationItems[].enum` | `Array` | `—` |
| `mandatoryAlterationItems[].required` | `true` | `—` |
| `totalAmount` | `Number` | `required: true; min: 0` |
| `packageItems` | `Array` | `—` |
| `packageItems[].packageId` | `String` | `—` |
| `packageItems[].packageName` | `String` | `—` |
| `packageItems[].variantId` | `ObjectId` | `ref: "Variant"` |
| `packageItems[].productName` | `String` | `trim: true` |
| `packageItems[].sku` | `String` | `uppercase: true` |
| `packageItems[].qty` | `Number` | `min: 1` |
| `packageItems[].size` | `String` | `trim: true` |
| `packageItems[].color` | `String` | `trim: true` |
| `ticketNumber` | `String` | `trim: true` |
| `ticketCreatedAt` | `Date` | `—` |
| `ticketCompletedBy` | `String` | `maxlength: 100` |
| `fittingCompletedAt` | `Date` | `index: true` |
| `fittingNotificationPreference` | `Subdocument` | `default: undefined` |
| `fittingNotificationPreference.method` | `String (enum)` | `required: true; enum: ["email", "phone"]` |
| `fittingNotificationPreference.contact` | `String` | `required: true; maxlength: 254; trim: true` |
| `fittingNotificationPreference.itemIndices` | `Array<Number>` | `required: true` |
| `fittingNotificationPreference.confirmedAt` | `Date` | `required: true` |
| `status` | `String (enum)` | `default: "pending"; enum: [ "pending", "received", "in_process", "partially_fulfilled", "embroidery", "tailoring", "hold_section", "shipped", "routed", "fulfilled", "returned", "cancelled", "backorder", "taken", "taken_date", "in_hold_section_date", "picked_up", ]; index: true` |
| `stagedAt` | `Date` | `—` |
| `holdSectionAt` | `Date` | `—` |
| `facilityId` | `String` | `index: true` |
| `locationId` | `String` | `index: true` |
| `locationName` | `String` | `trim: true` |
| `garmentTracking` | `Object` | `—` |
| `garmentTracking.currentStage` | `String (enum)` | `default: "pending"; enum: ["pending", "embroidery", "tailoring", "hold_section", "picked_up", "cancelled"]` |
| `garmentTracking.rackLocation` | `String` | `trim: true` |
| `garmentTracking.pickupSignatureUrl` | `String` | `—` |
| `garmentTracking.pickedUpAt` | `Date` | `—` |
| `garmentTracking.departmentHistory` | `Array` | `—` |
| `garmentTracking.departmentHistory[].stage` | `String` | `required: true` |
| `garmentTracking.departmentHistory[].timestamp` | `Date` | `default: Date.now` |
| `garmentTracking.departmentHistory[].updatedBy` | `String` | `—` |
| `garmentTracking.departmentHistory[].notes` | `String` | `—` |
| `garmentTracking.departmentHistory[].itemSku` | `String` | `—` |
| `garmentTracking.departmentHistory[].itemIndex` | `Number` | `—` |
| `garmentTracking.departmentHistory[].itemIndices` | `Array` | `—` |
| `garmentTracking.departmentHistory[].itemIndices[]` | `Number` | `—` |
| `garmentTracking.departmentHistory[].itemSkus` | `Array` | `—` |
| `garmentTracking.departmentHistory[].itemSkus[]` | `String` | `—` |
| `paymentMethod` | `String (enum)` | `default: "credits"; enum: ["credits", "cash", "bank_transfer"]` |
| `paymentReference` | `String` | `—` |
| `ncrReference` | `String` | `—` |
| `creditDeductedFrom` | `ObjectId` | `ref: "Credit"` |
| `creditTransactionId` | `String` | `—` |
| `routing` | `Object` | `—` |
| `routing.vendorAssignments` | `Map` | `of: [Schema.Types.ObjectId]` |
| `routing.routedAt` | `Date` | `—` |
| `dropshipStatus` | `Object` | `—` |
| `dropshipStatus.isDropship` | `Boolean` | `default: false` |
| `dropshipStatus.vendorId` | `ObjectId` | `ref: "Vendor"` |
| `dropshipStatus.trackingNumber` | `String` | `—` |
| `dropshipStatus.shippedAt` | `Date` | `—` |
| `approvalId` | `ObjectId` | `ref: "OrderApproval"` |
| `overrideRequestId` | `ObjectId` | `ref: "OverrideRequest"` |
| `isOverrideOrder` | `Boolean` | `default: false; index: true` |
| `overrideType` | `String (enum)` | `enum: ["USE_EXTRA_UNITS", "PAY_YOURSELF"]` |
| `shippingMethod` | `String` | `trim: true` |
| `departmentInfo` | `String` | `trim: true` |
| `requiresStoreFitting` | `Boolean` | `default: false` |
| `posFittingSource` | `Mixed` | `—` |
| `pickupLedger` | `Array` | `—` |
| `pickupLedger[].pickupId` | `String` | `required: true` |
| `pickupLedger[].pickedUpAt` | `Date` | `required: true` |
| `pickupLedger[].pickedUpByName` | `String` | `required: true` |
| `pickupLedger[].signatureDataUrl` | `String` | `default: ""` |
| `pickupLedger[].signatureEvidenceId` | `ObjectId` | `ref: 'VoucherEvidenceAsset'` |
| `pickupLedger[].witnessEmployeeName` | `String` | `default: ""` |
| `pickupLedger[].itemsPickedUp` | `Array` | `—` |
| `pickupLedger[].itemsPickedUp[].itemIndex` | `Number` | `—` |
| `pickupLedger[].itemsPickedUp[].unitId` | `String` | `—` |
| `pickupLedger[].itemsPickedUp[].sku` | `String` | `uppercase: true` |
| `pickupLedger[].itemsPickedUp[].qty` | `Number` | `—` |
| `pickupLedger[].notes` | `String` | `—` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ ticketNumber: 1 }, { unique: true, partialFilterExpression: { ticketNumber: { $type: "string" } } }`
- `{ userId: 1, status: 1 }`
- `{ pageId: 1, status: 1 }`
- `{ createdAt: -1 }`
- `{ "orderedBy.userId": 1, createdAt: -1 }`
- `{ "orderedFor.userId": 1, createdAt: -1 }`
- `{ approvalId: 1 }`

<a id="model-orderapproval"></a>
### OrderApproval (`orderapprovals`)

Source: [server/src/models/OrderApproval.model.ts](server/src/models/OrderApproval.model.ts). Schema options: `{ timestamps: true, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `orderId` | `ObjectId` | `required: true; ref: "Order"; unique: true; index: true` |
| `pageId` | `ObjectId` | `required: true; ref: "Page"; index: true` |
| `requestedBy` | `ObjectId` | `required: true; ref: "User"; index: true` |
| `requestedAt` | `Date` | `required: true; default: Date.now; index: true` |
| `orderAmount` | `Number` | `required: true; min: 0` |
| `requiredApprovers` | `Number` | `required: true; default: 1; min: 1` |
| `currentApprovers` | `Number` | `required: true; default: 0; min: 0` |
| `status` | `String (enum)` | `required: true; default: "pending"; enum: ["pending", "approved", "rejected", "auto_approved", "cancelled"]; index: true` |
| `approvalHistory` | `Array` | `—` |
| `approvalHistory[].approverId` | `ObjectId` | `required: true; ref: "User"` |
| `approvalHistory[].status` | `String (enum)` | `required: true; enum: ["pending", "approved", "rejected", "auto_approved", "cancelled"]` |
| `approvalHistory[].comment` | `String` | `maxlength: 500` |
| `approvalHistory[].approvedAt` | `Date` | `required: true; default: Date.now` |
| `autoApproved` | `Boolean` | `default: false` |
| `excessHandling` | `String (enum)` | `enum: ["admin_approval"]` |
| `exceededAmount` | `Number` | `min: 0` |
| `funding` | `Mixed` | `—` |
| `autoApprovalReason` | `String` | `maxlength: 200` |
| `rejectionReason` | `String` | `maxlength: 500` |
| `rejectedBy` | `ObjectId` | `ref: "User"` |
| `rejectedAt` | `Date` | `—` |
| `approvedAt` | `Date` | `—` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ orderId: 1 }, { unique: true }`
- `{ pageId: 1, status: 1 }`
- `{ requestedBy: 1 }`
- `{ status: 1, requestedAt: -1 }`
- `{ pageId: 1, requestedAt: -1 }`

<a id="model-overrideauditlog"></a>
### OverrideAuditLog (`overrideauditlogs`)

Source: [server/src/models/OverrideAuditLog.model.ts](server/src/models/OverrideAuditLog.model.ts). Schema options: `{ timestamps: { createdAt: true, updatedAt: false }, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `pageId` | `ObjectId` | `required: true; ref: "Page"; index: true` |
| `overrideRequestId` | `ObjectId` | `ref: "OverrideRequest"; index: true` |
| `orderId` | `ObjectId` | `ref: "Order"` |
| `action` | `String (enum)` | `required: true; enum: ["REQUEST_CREATED", "REQUEST_APPROVED", "REQUEST_REJECTED", "REQUEST_CANCELLED", "REQUEST_EXPIRED", "ORDER_CREATED_FROM_OVERRIDE", "ORDER_COMPLETED", "ORDER_CANCELLED", "OVERRIDE_SETTINGS_UPDATED", "OVERRIDE_CAPABILITY_LOCKED", "OVERRIDE_CAPABILITY_UNLOCKED", "USER_OVERRIDE_BLOCKED", "USER_OVERRIDE_UNBLOCKED", "ABUSE_THRESHOLD_EXCEEDED", "AUTO_LOCK_TRIGGERED"]; index: true` |
| `performedBy` | `ObjectId` | `ref: "User"` |
| `performedByType` | `String (enum)` | `required: true; enum: ["USER", "VENDOR", "SYSTEM"]` |
| `performedByName` | `String` | `—` |
| `targetUserId` | `ObjectId` | `ref: "User"` |
| `targetUserName` | `String` | `—` |
| `details` | `Mixed` | `default: {}` |
| `visibleToVendor` | `Boolean` | `default: true` |
| `visibleToAdmin` | `Boolean` | `default: true` |
| `ipAddress` | `String` | `—` |
| `userAgent` | `String` | `—` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ pageId: 1, createdAt: -1 }`
- `{ overrideRequestId: 1, createdAt: -1 }`
- `{ targetUserId: 1, createdAt: -1 }`
- `{ pageId: 1, action: 1, createdAt: -1 }`

<a id="model-overriderequest"></a>
### OverrideRequest (`overriderequests`)

Source: [server/src/models/OverrideRequest.model.ts](server/src/models/OverrideRequest.model.ts). Schema options: `{ timestamps: true, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `pageId` | `ObjectId` | `required: true; ref: "Page"; index: true` |
| `userId` | `ObjectId` | `required: true; ref: "User"; index: true` |
| `orderId` | `ObjectId` | `ref: "Order"` |
| `overrideType` | `String (enum)` | `required: true; enum: ["USE_EXTRA_UNITS", "PAY_YOURSELF"]` |
| `reasonCode` | `String` | `required: true` |
| `reasonDetails` | `String` | `maxlength: 1000` |
| `items` | `Array` | `required: true; validate: [ (arr: IOverrideRequestItem[]) => arr.length > 0, "At least one item required", ]` |
| `items[].variantId` | `ObjectId` | `required: true; ref: "Variant"` |
| `items[].productId` | `ObjectId` | `required: true; ref: "Product"` |
| `items[].productName` | `String` | `required: true` |
| `items[].variantName` | `String` | `required: true` |
| `items[].sku` | `String` | `required: true` |
| `items[].requestedQty` | `Number` | `required: true; min: 1` |
| `items[].unitPrice` | `Number` | `required: true; min: 0` |
| `items[].totalPrice` | `Number` | `required: true; min: 0` |
| `items[].size` | `String` | `trim: true` |
| `items[].color` | `String` | `trim: true` |
| `items[].length` | `String` | `trim: true` |
| `items[].notes` | `String` | `trim: true` |
| `items[].exceededLimit` | `Object` | `—` |
| `items[].exceededLimit.type` | `String` | `—` |
| `items[].exceededLimit.enum` | `Array` | `—` |
| `items[].exceededLimit.required` | `true` | `—` |
| `totalRequestedAmount` | `Number` | `required: true; min: 0` |
| `totalExcessAmount` | `Number` | `required: true; min: 0` |
| `status` | `String (enum)` | `default: "PENDING_VENDOR_APPROVAL"; enum: ["PENDING_VENDOR_APPROVAL", "APPROVED", "REJECTED", "CANCELLED", "EXPIRED"]; index: true` |
| `vendorDecision` | `Object` | `—` |
| `vendorDecision.decidedBy` | `ObjectId` | `ref: "VendorUser"` |
| `vendorDecision.decidedByName` | `String` | `—` |
| `vendorDecision.decision` | `String (enum)` | `enum: ["APPROVED", "REJECTED"]` |
| `vendorDecision.comment` | `String` | `—` |
| `vendorDecision.decidedAt` | `Date` | `—` |
| `requestedAt` | `Date` | `default: Date.now` |
| `expiresAt` | `Date` | `—` |
| `completedAt` | `Date` | `—` |
| `createdBy` | `ObjectId` | `required: true; ref: "User"` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ pageId: 1, status: 1 }`
- `{ pageId: 1, userId: 1, createdAt: -1 }`
- `{ status: 1, expiresAt: 1 }`

<a id="model-package"></a>
### Package (`packages`)

Source: [server/src/models/Package.model.ts](server/src/models/Package.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `vendorId` | `String` | `required: false; ref: "Vendor"; index: true` |
| `pageId` | `String` | `index: true; sparse: true` |
| `name` | `String` | `required: true; maxlength: 200; trim: true` |
| `description` | `String` | `maxlength: 1000; trim: true` |
| `thumbnail` | `String` | `trim: true` |
| `category` | `String` | `ref: "Taxonomy"` |
| `subcategory` | `String` | `trim: true` |
| `categoryPath` | `Array` | `—` |
| `categoryPath[].id` | `String` | `—` |
| `categoryPath[].name` | `String` | `—` |
| `categoryPath[]._id` | `false` | `—` |
| `products` | `Array` | `—` |
| `products[].productId` | `ObjectId` | `required: true; ref: "Product"` |
| `products[].variantId` | `ObjectId` | `ref: "Variant"` |
| `products[].quantity` | `Number` | `required: true; default: 1; min: 1` |
| `products[]._id` | `false` | `—` |
| `price` | `Number` | `required: false; default: 0; min: 0` |
| `units` | `Number` | `min: 0` |
| `visibleToRoles` | `Array` | `—` |
| `visibleToRoles[]` | `String` | `enum: ["admin", "officer"]; default: []` |
| `visibleToGroups` | `Array` | `—` |
| `visibleToGroups[]` | `Schema.Types.ObjectId` | `ref: "EmployeeGroup"` |
| `purchaseLimit` | `Object` | `—` |
| `purchaseLimit.perUser` | `Number` | `min: 1` |
| `purchaseLimit.unlimited` | `Boolean` | `default: true` |
| `allowedUsers` | `Array` | `—` |
| `allowedUsers[]` | `Schema.Types.ObjectId` | `ref: "User"` |
| `blockedUsers` | `Array` | `—` |
| `blockedUsers[]` | `Schema.Types.ObjectId` | `ref: "User"` |
| `status` | `String (enum)` | `default: "active"; enum: ["active", "inactive", "archived"]` |
| `isActive` | `Boolean` | `default: true; index: true` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ vendorId: 1, status: 1 }`
- `{ name: 1 }`
- `{ visibleToGroups: 1 }`

<a id="model-page"></a>
### Page (`pages`)

Source: [server/src/models/Page.model.ts](server/src/models/Page.model.ts). Schema options: `{ timestamps: true, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `title` | `String` | `required: true; maxlength: 200; trim: true` |
| `slug` | `String` | `required: true; unique: true; index: true; trim: true; lowercase: true` |
| `description` | `String` | `maxlength: 1000` |
| `logoUrl` | `String` | `trim: true` |
| `inactiveUserThresholdDays` | `Number` | `default: 30` |
| `enableInactiveAutoFlag` | `Boolean` | `default: true` |
| `tenantCode` | `String` | `index: true; sparse: true; trim: true; uppercase: true` |
| `contactEmail` | `String` | `sparse: true; trim: true; lowercase: true` |
| `contactPhone` | `String` | `trim: true` |
| `taxExemptNumber` | `String` | `default: ""; trim: true` |
| `companyContact` | `String` | `default: ""; trim: true` |
| `companyAddress` | `String` | `default: ""; trim: true` |
| `accountNumber` | `String` | `default: ""; trim: true` |
| `dueDate` | `String` | `default: ""; trim: true` |
| `address` | `Object` | `—` |
| `address.street` | `String` | `—` |
| `address.city` | `String` | `—` |
| `address.state` | `String` | `—` |
| `address.country` | `String` | `—` |
| `address.zipCode` | `String` | `—` |
| `productIds` | `Array` | `—` |
| `productIds[]` | `Schema.Types.ObjectId` | `ref: "Product"` |
| `featuredProductIds` | `Array` | `—` |
| `featuredProductIds[]` | `Schema.Types.ObjectId` | `ref: "Product"` |
| `createdBy` | `ObjectId` | `required: true; ref: "User"` |
| `vendorId` | `ObjectId` | `ref: "Vendor"; index: true; sparse: true` |
| `creationStep` | `String (enum)` | `default: "customers"; enum: ["customers", "admins", "products", "rules", "ready", "published"]; index: true` |
| `template` | `Object` | `—` |
| `template.purchasePermission` | `String (enum)` | `required: true; default: "everyone"; enum: ["admin_only", "everyone_with_approval", "everyone"]` |
| `template.requiresApproval` | `Boolean` | `default: false` |
| `template.approvalWorkflow` | `Object` | `—` |
| `template.approvalWorkflow.autoApprove` | `Boolean` | `default: false` |
| `template.approvalWorkflow.approvalThreshold` | `Number` | `min: 0` |
| `template.approvalWorkflow.notifyAdmins` | `Boolean` | `default: true` |
| `template.approvalWorkflow.requiredApprovers` | `Number` | `default: 1; min: 1` |
| `notificationSettings` | `Object` | `—` |
| `notificationSettings.sendEmailToAdminsOnly` | `Boolean` | `default: false` |
| `emailConfig` | `Object` | `—` |
| `emailConfig.receivableEmail` | `String` | `trim: true; lowercase: true` |
| `emailConfig.smtp` | `Object` | `—` |
| `emailConfig.smtp.host` | `String` | `trim: true` |
| `emailConfig.smtp.port` | `Number` | `—` |
| `emailConfig.smtp.secure` | `Boolean` | `default: true` |
| `emailConfig.smtp.user` | `String` | `trim: true` |
| `emailConfig.smtp.encryptedPassword` | `String` | `—` |
| `emailConfig.smtp.from` | `String` | `trim: true` |
| `users` | `Object` | `—` |
| `users.admins` | `Array` | `—` |
| `users.admins[]` | `Schema.Types.ObjectId` | `ref: "User"` |
| `users.officers` | `Array` | `—` |
| `users.officers[]` | `Schema.Types.ObjectId` | `ref: "User"` |
| `users.pendingApprovals` | `Array` | `—` |
| `users.pendingApprovals[].userId` | `ObjectId` | `required: false; ref: "User"` |
| `users.pendingApprovals[].email` | `String` | `required: true; trim: true; lowercase: true` |
| `users.pendingApprovals[].addedBy` | `ObjectId` | `ref: "User"` |
| `users.pendingApprovals[].addedAt` | `Date` | `default: Date.now` |
| `users.pendingApprovals[].status` | `String (enum)` | `default: "pending"; enum: ["pending", "approved", "rejected"]` |
| `buyerEligibilityConfigId` | `ObjectId` | `ref: "BuyerEligibilityConfig"; sparse: true` |
| `allotmentId` | `ObjectId` | `ref: "Allotment"; sparse: true` |
| `overrideConfig` | `Object` | `—` |
| `overrideConfig.enabled` | `Boolean` | `default: false` |
| `overrideConfig.allowedFor` | `Array<String>` | `default: ["admin"]; enum: ["admin", "officer"]` |
| `overrideConfig.requiresVendorApproval` | `Boolean` | `default: true` |
| `overrideConfig.approvalLevels` | `Number (enum)` | `default: 1; enum: [1, 2, 3]` |
| `overrideConfig.reasonCodes` | `Array` | `—` |
| `overrideConfig.reasonCodes[].code` | `String` | `required: true; uppercase: true` |
| `overrideConfig.reasonCodes[].label` | `String` | `required: true` |
| `overrideConfig.reasonCodes[].description` | `String` | `—` |
| `overrideConfig.reasonCodes[].isActive` | `Boolean` | `default: true` |
| `overrideConfig.isLocked` | `Boolean` | `default: false` |
| `overrideConfig.lockedReason` | `String` | `—` |
| `overrideConfig.lockedAt` | `Date` | `—` |
| `overrideConfig.lockedBy` | `ObjectId` | `ref: "VendorUser"` |
| `publishedConfig` | `Object` | `—` |
| `publishedConfig.publishedAt` | `Date` | `—` |
| `publishedConfig.publishedBy` | `ObjectId` | `ref: "User"` |
| `publishedConfig.snapshot` | `Object` | `—` |
| `publishedConfig.snapshot.productIds` | `Array` | `—` |
| `publishedConfig.snapshot.productIds[]` | `Schema.Types.ObjectId` | `ref: "Product"` |
| `publishedConfig.snapshot.adminIds` | `Array` | `—` |
| `publishedConfig.snapshot.adminIds[]` | `Schema.Types.ObjectId` | `ref: "User"` |
| `publishedConfig.snapshot.buyerEligibilityConfigId` | `ObjectId` | `ref: "BuyerEligibilityConfig"` |
| `publishedConfig.snapshot.allotmentId` | `ObjectId` | `ref: "Allotment"` |
| `status` | `String (enum)` | `default: "draft"; enum: ["draft", "published", "archived"]; index: true` |
| `layout` | `String (enum)` | `default: "grid"; enum: ["grid", "list", "masonry", "carousel"]` |
| `theme` | `Object` | `—` |
| `theme.primaryColor` | `String` | `—` |
| `theme.secondaryColor` | `String` | `—` |
| `theme.fontFamily` | `String` | `—` |
| `seo` | `Object` | `—` |
| `seo.metaTitle` | `String` | `—` |
| `seo.metaDescription` | `String` | `—` |
| `seo.metaKeywords` | `Array<String>` | `—` |
| `seo.ogImage` | `String` | `—` |
| `filters` | `Object` | `—` |
| `filters.categories` | `Array<String>` | `—` |
| `filters.brands` | `Array<String>` | `—` |
| `filters.priceRange` | `Object` | `—` |
| `filters.priceRange.min` | `Number` | `—` |
| `filters.priceRange.max` | `Number` | `—` |
| `filters.attributes` | `Array` | `—` |
| `filters.attributes[].key` | `String` | `—` |
| `filters.attributes[].values` | `Array<String>` | `—` |
| `sortOrder` | `Object` | `—` |
| `sortOrder.field` | `String (enum)` | `default: "createdAt"; enum: ["name", "price", "createdAt", "popularity", "custom"]` |
| `sortOrder.direction` | `String (enum)` | `default: "desc"; enum: ["asc", "desc"]` |
| `sortOrder.customOrder` | `Array` | `—` |
| `sortOrder.customOrder[]` | `Schema.Types.ObjectId` | `ref: "Product"` |
| `visibility` | `Object` | `—` |
| `visibility.startDate` | `Date` | `—` |
| `visibility.endDate` | `Date` | `—` |
| `visibility.geoRestrictions` | `Array<String>` | `—` |
| `visibility.customerGroups` | `Array<String>` | `—` |
| `analytics` | `Object` | `—` |
| `analytics.views` | `Number` | `default: 0` |
| `analytics.conversions` | `Number` | `default: 0` |
| `analytics.lastViewed` | `Date` | `—` |
| `shipmentLocations` | `Array<String>` | `default: []` |
| `customFields` | `Map` | `of: Schema.Types.Mixed` |
| `isActive` | `Boolean` | `default: true; index: true` |
| `publishedAt` | `Date` | `—` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ status: 1, isActive: 1 }`
- `{ createdBy: 1 }`
- `{ "analytics.views": -1 }`
- `{ productIds: 1 }`

Middleware declarations: `pre("save") in server/src/models/Page.model.ts at line 539`.

<a id="model-po"></a>
### PO (`pos`)

Source: [server/src/models/PO.model.ts](server/src/models/PO.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `orderId` | `ObjectId` | `required: true; ref: "Order"; index: true` |
| `vendorId` | `ObjectId` | `required: true; ref: "Vendor"` |
| `items` | `Array` | `—` |
| `items[].variantId` | `ObjectId` | `required: true; ref: "Variant"` |
| `items[].sku` | `String` | `required: true; uppercase: true` |
| `items[].qty` | `Number` | `required: true; min: 1` |
| `items[].price` | `Number` | `required: true; min: 0` |
| `total` | `Number` | `required: true; min: 0` |
| `generatedAt` | `Date` | `required: true; default: Date.now` |
| `pdfUrl` | `String` | `—` |
| `status` | `String (enum)` | `default: "pending"; enum: ["pending", "sent", "acknowledged", "completed"]` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ orderId: 1, vendorId: 1 }`

<a id="model-portalauditlog"></a>
### PortalAuditLog (`portalauditlogs`)

Source: [server/src/models/PortalAuditLog.model.ts](server/src/models/PortalAuditLog.model.ts). Schema options: `{ timestamps: { createdAt: true, updatedAt: false } }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `pageId` | `ObjectId` | `required: true; ref: "Page"; index: true` |
| `action` | `String (enum)` | `required: true; enum: ["user_added", "user_removed", "user_activated", "user_deactivated", "user_updated", "role_changed"]; index: true` |
| `targetUserId` | `ObjectId` | `required: true; ref: "User"; index: true` |
| `performedBy` | `ObjectId` | `ref: "User"; index: true` |
| `details` | `Mixed` | `—` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ pageId: 1, createdAt: -1 }`

<a id="model-posorder"></a>
### PosOrder (`posorders`)

Source: [server/src/models/PosOrder.model.ts](server/src/models/PosOrder.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `fittingCompletedAt` | `Date` | `index: true` |
| `voucherProcessing` | `Mixed` | `—` |
| `fittingNotificationPreference` | `Subdocument` | `default: undefined` |
| `fittingNotificationPreference.method` | `String (enum)` | `required: true; enum: ["email", "phone"]` |
| `fittingNotificationPreference.contact` | `String` | `required: true; maxlength: 254; trim: true` |
| `fittingNotificationPreference.itemIndices` | `Array<Number>` | `required: true` |
| `fittingNotificationPreference.confirmedAt` | `Date` | `required: true` |
| `localId` | `String` | `required: true; unique: true` |
| `terminalId` | `String` | `required: true` |
| `cashierId` | `ObjectId` | `ref: "Cashier"` |
| `cashierName` | `String` | `required: true` |
| `counterNo` | `String` | `required: true` |
| `counterName` | `String` | `—` |
| `facilityId` | `String` | `index: true` |
| `stockShowroomId` | `String` | `—` |
| `locationId` | `String` | `index: true` |
| `locationName` | `String` | `—` |
| `userId` | `ObjectId` | `ref: "User"` |
| `pageId` | `ObjectId` | `ref: "Page"` |
| `groupId` | `ObjectId` | `ref: "EmployeeGroup"` |
| `subtotal` | `Number` | `—` |
| `discountTotal` | `Number` | `—` |
| `taxTotal` | `Number` | `—` |
| `taxRate` | `Number` | `—` |
| `globalDiscountPercent` | `Number` | `—` |
| `globalDiscountAmount` | `Number` | `—` |
| `isTaxExempt` | `Boolean` | `default: false` |
| `totalAmount` | `Number` | `required: true` |
| `totalUnitsUsed` | `Number` | `default: 0` |
| `allotmentCovered` | `Number` | `default: 0` |
| `allotmentType` | `String` | `—` |
| `paymentMethod` | `String` | `required: true` |
| `payments` | `Array` | `—` |
| `payments[].method` | `String` | `required: true` |
| `payments[].amount` | `Number` | `required: true` |
| `payments[].reference` | `String` | `—` |
| `payments[].giftCardBarcode` | `String` | `—` |
| `status` | `String (enum)` | `default: "completed"; enum: ["completed", "reopened", "voided", "refunded", "pending", "in_process", "partially_fulfilled", "ready_for_pickup", "fulfilled", "cancelled"]` |
| `poNumber` | `String` | `trim: true` |
| `isARTicket` | `Boolean` | `default: false` |
| `batchSettledAt` | `Date` | `—` |
| `cardLast4` | `String` | `—` |
| `cardAuthCode` | `String` | `—` |
| `paymentProcessorTxnId` | `String` | `—` |
| `ncrReference` | `String` | `—` |
| `buyerProvided` | `Number` | `—` |
| `changeDue` | `Number` | `—` |
| `editHistory` | `Array` | `—` |
| `editHistory[].editType` | `String` | `required: true` |
| `editHistory[].editedBy` | `String` | `required: true` |
| `editHistory[].editedAt` | `Date` | `default: Date.now` |
| `editHistory[].description` | `String` | `required: true` |
| `editHistory[].amountDelta` | `Number` | `default: 0` |
| `editHistory[].allotmentDelta` | `Number` | `default: 0` |
| `editHistory[].unitsRefunded` | `Number` | `default: 0` |
| `editHistory[].paymentAction` | `String` | `—` |
| `editHistory[].paymentActionStatus` | `String` | `—` |
| `editHistory[].additionalPayments` | `Array` | `—` |
| `editHistory[].additionalPayments[].method` | `String` | `required: true` |
| `editHistory[].additionalPayments[].amount` | `Number` | `required: true` |
| `editHistory[].additionalPayments[].reference` | `String` | `—` |
| `editHistory[].additionalPayments[].giftCardBarcode` | `String` | `—` |
| `isWalkInCompany` | `Boolean` | `default: false` |
| `walkInCompanyName` | `String` | `—` |
| `receiptData` | `Mixed` | `—` |
| `posFundingCommitted` | `Boolean` | `—` |
| `posFundingProcessing` | `Mixed` | `—` |
| `items` | `Array` | `—` |
| `items[].productId` | `Mixed` | `—` |
| `items[].variantId` | `Mixed` | `—` |
| `items[].sku` | `String` | `—` |
| `items[].productName` | `String` | `default: "Unknown Product"` |
| `items[].variantName` | `String` | `—` |
| `items[].color` | `Mixed` | `—` |
| `items[].size` | `String` | `—` |
| `items[].length` | `String` | `—` |
| `items[].attributes` | `Array<Schema.Types.Mixed>` | `—` |
| `items[].categoryId` | `Mixed` | `—` |
| `items[].subcategoryName` | `String` | `—` |
| `items[].qty` | `Number` | `required: true` |
| `items[].price` | `Number` | `required: true` |
| `items[].originalPrice` | `Number` | `—` |
| `items[].contractPrice` | `Number` | `—` |
| `items[].discountAmount` | `Number` | `—` |
| `items[].discountPercent` | `Number` | `—` |
| `items[].discountedPrice` | `Number` | `—` |
| `items[].customPrice` | `Number` | `—` |
| `items[].isTaxExempt` | `Boolean` | `—` |
| `items[].taxRate` | `Number` | `—` |
| `items[].taxAmount` | `Number` | `—` |
| `items[].unitsUsed` | `Number` | `default: 0` |
| `items[].mandatoryAlterations` | `Array<Schema.Types.Mixed>` | `—` |
| `items[].alterationSkipped` | `Boolean` | `default: undefined` |
| `items[].alterationInputs` | `Mixed` | `—` |
| `items[].alterationNotes` | `String` | `trim: true` |
| `items[].fittingReview` | `Subdocument` | `default: undefined` |
| `items[].fittingReview.availability` | `String (enum)` | `required: true; enum: ["ready", "backorder", "hold"]` |
| `items[].fittingReview.requiresAlteration` | `Boolean` | `required: true` |
| `items[].fittingReview.completedAt` | `Date` | `—` |
| `items[].stockDeduction` | `Mixed` | `—` |
| `items[].fittingUnit` | `Mixed` | `—` |
| `items[].cartUnit` | `Mixed` | `—` |
| `items[].pickupCallConfirmedAt` | `Date` | `—` |
| `items[].pickupCallConfirmedBy` | `String` | `trim: true` |
| `items[].alterations` | `Array<Schema.Types.Mixed>` | `—` |
| `items[].isRestrictedItem` | `Boolean` | `default: false` |
| `items[].officerIdNumber` | `String` | `trim: true` |
| `items[].idVerifiedBy` | `String` | `trim: true` |
| `items[].idVerifiedAt` | `Date` | `—` |
| `items[].itemType` | `String (enum)` | `default: "regular_sale"; enum: ["regular_sale", "order", "layaway", "backorder", "hold", "alteration_required"]` |
| `items[].status` | `String` | `—` |
| `items[].itemStatus` | `String (enum)` | `default: "ordered"; enum: ["ordered", "backordered", "received", "in_alteration", "hold_section", "ready_for_pickup", "picked_up"]` |
| `items[].garmentStage` | `String (enum)` | `enum: ["pending", "embroidery", "tailoring", "hold_section", "picked_up"]` |
| `items[].fulfillment` | `Object` | `—` |
| `items[].fulfillment.fulfilledQty` | `Number` | `default: 0` |
| `items[].fulfillment.pendingQty` | `Number` | `default: 0` |
| `items[].fulfillment.fulfilledAt` | `Date` | `—` |
| `items[].fulfillment.pickedUpBy` | `String` | `—` |
| `items[].rackLocation` | `String` | `trim: true` |
| `items[].locationId` | `String` | `trim: true` |
| `items[].locationName` | `String` | `trim: true` |
| `items[].stagedAt` | `Date` | `—` |
| `items[].holdSectionAt` | `Date` | `—` |
| `items[].itemNotes` | `String` | `trim: true` |
| `items[].layawayDetails` | `Object` | `—` |
| `items[].layawayDetails.depositAmount` | `Number` | `—` |
| `items[].layawayDetails.balanceRemaining` | `Number` | `—` |
| `items[].layawayDetails.dueDate` | `Date` | `—` |
| `items[].layawayDetails.minimumDepositPercent` | `Number` | `default: 20` |
| `items[].oversizeSurcharge` | `Number` | `—` |
| `items[].isSizedGarment` | `Boolean` | `default: false` |
| `syncTimestamp` | `Date` | `default: Date.now` |
| `stagedAt` | `Date` | `—` |
| `holdSectionAt` | `Date` | `—` |
| `garmentTracking` | `Object` | `—` |
| `garmentTracking.currentStage` | `String (enum)` | `default: "pending"; enum: ["pending", "embroidery", "tailoring", "hold_section", "picked_up"]` |
| `garmentTracking.rackLocation` | `String` | `trim: true` |
| `garmentTracking.pickupSignatureUrl` | `String` | `—` |
| `garmentTracking.pickedUpAt` | `Date` | `—` |
| `garmentTracking.departmentHistory` | `Array` | `—` |
| `garmentTracking.departmentHistory[].stage` | `String` | `required: true` |
| `garmentTracking.departmentHistory[].timestamp` | `Date` | `default: Date.now` |
| `garmentTracking.departmentHistory[].updatedBy` | `String` | `—` |
| `garmentTracking.departmentHistory[].notes` | `String` | `—` |
| `garmentTracking.departmentHistory[].itemSku` | `String` | `—` |
| `garmentTracking.departmentHistory[].itemIndex` | `Number` | `—` |
| `garmentTracking.departmentHistory[].itemIndices` | `Array` | `—` |
| `garmentTracking.departmentHistory[].itemIndices[]` | `Number` | `—` |
| `garmentTracking.departmentHistory[].itemSkus` | `Array` | `—` |
| `garmentTracking.departmentHistory[].itemSkus[]` | `String` | `—` |
| `requiresStoreFitting` | `Boolean` | `default: false` |
| `pickupLedger` | `Array` | `—` |
| `pickupLedger[].pickupId` | `String` | `required: true` |
| `pickupLedger[].pickedUpAt` | `Date` | `required: true` |
| `pickupLedger[].pickedUpByName` | `String` | `required: true` |
| `pickupLedger[].signatureDataUrl` | `String` | `default: ""` |
| `pickupLedger[].witnessEmployeeName` | `String` | `default: ""` |
| `pickupLedger[].itemsPickedUp` | `Array` | `—` |
| `pickupLedger[].itemsPickedUp[].itemIndex` | `Number` | `—` |
| `pickupLedger[].itemsPickedUp[].sku` | `String` | `uppercase: true` |
| `pickupLedger[].itemsPickedUp[].qty` | `Number` | `—` |
| `pickupLedger[].notes` | `String` | `—` |
| `voidSignatureUrl` | `String` | `—` |
| `returnSignatureUrl` | `String` | `—` |
| `returnLedger` | `Array` | `—` |
| `returnLedger[].returnedAt` | `Date` | `required: true` |
| `returnLedger[].sku` | `String` | `—` |
| `returnLedger[].qty` | `Number` | `required: true` |
| `returnLedger[].signatureDataUrl` | `String` | `required: true` |
| `returnLedger[].signedByName` | `String` | `required: true` |
| `returnLedger[].processedBy` | `String` | `required: true` |
| `signatureEvents` | `Array` | `—` |
| `signatureEvents[].eventId` | `String` | `required: true` |
| `signatureEvents[].eventType` | `String (enum)` | `required: true; enum: ["card_void", "return"]` |
| `signatureEvents[].signedAt` | `Date` | `required: true` |
| `signatureEvents[].signatureDataUrl` | `String` | `required: true` |
| `signatureEvents[].signedByName` | `String` | `required: true` |
| `signatureEvents[].processedBy` | `String` | `required: true` |
| `signatureEvents[].reference` | `String` | `—` |

<a id="model-posorderoperation"></a>
### PosOrderOperation (`posorderoperations`)

Source: [server/src/models/PosOrderOperation.model.ts](server/src/models/PosOrderOperation.model.ts). Schema options: `{ timestamps: true }`.

Schema cloned from [server/src/models/PosOrder.model.ts](server/src/models/PosOrder.model.ts); inherited paths and indexes are included.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `fittingCompletedAt` | `Date` | `index: true` |
| `voucherProcessing` | `Mixed` | `—` |
| `fittingNotificationPreference` | `Subdocument` | `default: undefined` |
| `fittingNotificationPreference.method` | `String (enum)` | `required: true; enum: ["email", "phone"]` |
| `fittingNotificationPreference.contact` | `String` | `required: true; maxlength: 254; trim: true` |
| `fittingNotificationPreference.itemIndices` | `Array<Number>` | `required: true` |
| `fittingNotificationPreference.confirmedAt` | `Date` | `required: true` |
| `localId` | `String` | `required: true; unique: true` |
| `terminalId` | `String` | `required: true` |
| `cashierId` | `ObjectId` | `ref: "Cashier"` |
| `cashierName` | `String` | `required: true` |
| `counterNo` | `String` | `required: true` |
| `counterName` | `String` | `—` |
| `facilityId` | `String` | `index: true` |
| `stockShowroomId` | `String` | `—` |
| `locationId` | `String` | `index: true` |
| `locationName` | `String` | `—` |
| `userId` | `ObjectId` | `ref: "User"` |
| `pageId` | `ObjectId` | `ref: "Page"` |
| `groupId` | `ObjectId` | `ref: "EmployeeGroup"` |
| `subtotal` | `Number` | `—` |
| `discountTotal` | `Number` | `—` |
| `taxTotal` | `Number` | `—` |
| `taxRate` | `Number` | `—` |
| `globalDiscountPercent` | `Number` | `—` |
| `globalDiscountAmount` | `Number` | `—` |
| `isTaxExempt` | `Boolean` | `default: false` |
| `totalAmount` | `Number` | `required: true` |
| `totalUnitsUsed` | `Number` | `default: 0` |
| `allotmentCovered` | `Number` | `default: 0` |
| `allotmentType` | `String` | `—` |
| `paymentMethod` | `String` | `required: true` |
| `payments` | `Array` | `—` |
| `payments[].method` | `String` | `required: true` |
| `payments[].amount` | `Number` | `required: true` |
| `payments[].reference` | `String` | `—` |
| `payments[].giftCardBarcode` | `String` | `—` |
| `status` | `String (enum)` | `default: "completed"; enum: ["completed", "reopened", "voided", "refunded", "pending", "in_process", "partially_fulfilled", "ready_for_pickup", "fulfilled", "cancelled"]` |
| `poNumber` | `String` | `trim: true` |
| `isARTicket` | `Boolean` | `default: false` |
| `batchSettledAt` | `Date` | `—` |
| `cardLast4` | `String` | `—` |
| `cardAuthCode` | `String` | `—` |
| `paymentProcessorTxnId` | `String` | `—` |
| `ncrReference` | `String` | `—` |
| `buyerProvided` | `Number` | `—` |
| `changeDue` | `Number` | `—` |
| `editHistory` | `Array` | `—` |
| `editHistory[].editType` | `String` | `required: true` |
| `editHistory[].editedBy` | `String` | `required: true` |
| `editHistory[].editedAt` | `Date` | `default: Date.now` |
| `editHistory[].description` | `String` | `required: true` |
| `editHistory[].amountDelta` | `Number` | `default: 0` |
| `editHistory[].allotmentDelta` | `Number` | `default: 0` |
| `editHistory[].unitsRefunded` | `Number` | `default: 0` |
| `editHistory[].paymentAction` | `String` | `—` |
| `editHistory[].paymentActionStatus` | `String` | `—` |
| `editHistory[].additionalPayments` | `Array` | `—` |
| `editHistory[].additionalPayments[].method` | `String` | `required: true` |
| `editHistory[].additionalPayments[].amount` | `Number` | `required: true` |
| `editHistory[].additionalPayments[].reference` | `String` | `—` |
| `editHistory[].additionalPayments[].giftCardBarcode` | `String` | `—` |
| `isWalkInCompany` | `Boolean` | `default: false` |
| `walkInCompanyName` | `String` | `—` |
| `receiptData` | `Mixed` | `—` |
| `posFundingCommitted` | `Boolean` | `—` |
| `posFundingProcessing` | `Mixed` | `—` |
| `items` | `Array` | `—` |
| `items[].productId` | `Mixed` | `—` |
| `items[].variantId` | `Mixed` | `—` |
| `items[].sku` | `String` | `—` |
| `items[].productName` | `String` | `default: "Unknown Product"` |
| `items[].variantName` | `String` | `—` |
| `items[].color` | `Mixed` | `—` |
| `items[].size` | `String` | `—` |
| `items[].length` | `String` | `—` |
| `items[].attributes` | `Array<Schema.Types.Mixed>` | `—` |
| `items[].categoryId` | `Mixed` | `—` |
| `items[].subcategoryName` | `String` | `—` |
| `items[].qty` | `Number` | `required: true` |
| `items[].price` | `Number` | `required: true` |
| `items[].originalPrice` | `Number` | `—` |
| `items[].contractPrice` | `Number` | `—` |
| `items[].discountAmount` | `Number` | `—` |
| `items[].discountPercent` | `Number` | `—` |
| `items[].discountedPrice` | `Number` | `—` |
| `items[].customPrice` | `Number` | `—` |
| `items[].isTaxExempt` | `Boolean` | `—` |
| `items[].taxRate` | `Number` | `—` |
| `items[].taxAmount` | `Number` | `—` |
| `items[].unitsUsed` | `Number` | `default: 0` |
| `items[].mandatoryAlterations` | `Array<Schema.Types.Mixed>` | `—` |
| `items[].alterationSkipped` | `Boolean` | `default: undefined` |
| `items[].alterationInputs` | `Mixed` | `—` |
| `items[].alterationNotes` | `String` | `trim: true` |
| `items[].fittingReview` | `Subdocument` | `default: undefined` |
| `items[].fittingReview.availability` | `String (enum)` | `required: true; enum: ["ready", "backorder", "hold"]` |
| `items[].fittingReview.requiresAlteration` | `Boolean` | `required: true` |
| `items[].fittingReview.completedAt` | `Date` | `—` |
| `items[].stockDeduction` | `Mixed` | `—` |
| `items[].fittingUnit` | `Mixed` | `—` |
| `items[].cartUnit` | `Mixed` | `—` |
| `items[].pickupCallConfirmedAt` | `Date` | `—` |
| `items[].pickupCallConfirmedBy` | `String` | `trim: true` |
| `items[].alterations` | `Array<Schema.Types.Mixed>` | `—` |
| `items[].isRestrictedItem` | `Boolean` | `default: false` |
| `items[].officerIdNumber` | `String` | `trim: true` |
| `items[].idVerifiedBy` | `String` | `trim: true` |
| `items[].idVerifiedAt` | `Date` | `—` |
| `items[].itemType` | `String (enum)` | `default: "regular_sale"; enum: ["regular_sale", "order", "layaway", "backorder", "hold", "alteration_required"]` |
| `items[].status` | `String` | `—` |
| `items[].itemStatus` | `String (enum)` | `default: "ordered"; enum: ["ordered", "backordered", "received", "in_alteration", "hold_section", "ready_for_pickup", "picked_up"]` |
| `items[].garmentStage` | `String (enum)` | `enum: ["pending", "embroidery", "tailoring", "hold_section", "picked_up"]` |
| `items[].fulfillment` | `Object` | `—` |
| `items[].fulfillment.fulfilledQty` | `Number` | `default: 0` |
| `items[].fulfillment.pendingQty` | `Number` | `default: 0` |
| `items[].fulfillment.fulfilledAt` | `Date` | `—` |
| `items[].fulfillment.pickedUpBy` | `String` | `—` |
| `items[].rackLocation` | `String` | `trim: true` |
| `items[].locationId` | `String` | `trim: true` |
| `items[].locationName` | `String` | `trim: true` |
| `items[].stagedAt` | `Date` | `—` |
| `items[].holdSectionAt` | `Date` | `—` |
| `items[].itemNotes` | `String` | `trim: true` |
| `items[].layawayDetails` | `Object` | `—` |
| `items[].layawayDetails.depositAmount` | `Number` | `—` |
| `items[].layawayDetails.balanceRemaining` | `Number` | `—` |
| `items[].layawayDetails.dueDate` | `Date` | `—` |
| `items[].layawayDetails.minimumDepositPercent` | `Number` | `default: 20` |
| `items[].oversizeSurcharge` | `Number` | `—` |
| `items[].isSizedGarment` | `Boolean` | `default: false` |
| `syncTimestamp` | `Date` | `default: Date.now` |
| `stagedAt` | `Date` | `—` |
| `holdSectionAt` | `Date` | `—` |
| `garmentTracking` | `Object` | `—` |
| `garmentTracking.currentStage` | `String (enum)` | `default: "pending"; enum: ["pending", "embroidery", "tailoring", "hold_section", "picked_up"]` |
| `garmentTracking.rackLocation` | `String` | `trim: true` |
| `garmentTracking.pickupSignatureUrl` | `String` | `—` |
| `garmentTracking.pickedUpAt` | `Date` | `—` |
| `garmentTracking.departmentHistory` | `Array` | `—` |
| `garmentTracking.departmentHistory[].stage` | `String` | `required: true` |
| `garmentTracking.departmentHistory[].timestamp` | `Date` | `default: Date.now` |
| `garmentTracking.departmentHistory[].updatedBy` | `String` | `—` |
| `garmentTracking.departmentHistory[].notes` | `String` | `—` |
| `garmentTracking.departmentHistory[].itemSku` | `String` | `—` |
| `garmentTracking.departmentHistory[].itemIndex` | `Number` | `—` |
| `garmentTracking.departmentHistory[].itemIndices` | `Array` | `—` |
| `garmentTracking.departmentHistory[].itemIndices[]` | `Number` | `—` |
| `garmentTracking.departmentHistory[].itemSkus` | `Array` | `—` |
| `garmentTracking.departmentHistory[].itemSkus[]` | `String` | `—` |
| `requiresStoreFitting` | `Boolean` | `default: false` |
| `pickupLedger` | `Array` | `—` |
| `pickupLedger[].pickupId` | `String` | `required: true` |
| `pickupLedger[].pickedUpAt` | `Date` | `required: true` |
| `pickupLedger[].pickedUpByName` | `String` | `required: true` |
| `pickupLedger[].signatureDataUrl` | `String` | `default: ""` |
| `pickupLedger[].witnessEmployeeName` | `String` | `default: ""` |
| `pickupLedger[].itemsPickedUp` | `Array` | `—` |
| `pickupLedger[].itemsPickedUp[].itemIndex` | `Number` | `—` |
| `pickupLedger[].itemsPickedUp[].sku` | `String` | `uppercase: true` |
| `pickupLedger[].itemsPickedUp[].qty` | `Number` | `—` |
| `pickupLedger[].notes` | `String` | `—` |
| `voidSignatureUrl` | `String` | `—` |
| `returnSignatureUrl` | `String` | `—` |
| `returnLedger` | `Array` | `—` |
| `returnLedger[].returnedAt` | `Date` | `required: true` |
| `returnLedger[].sku` | `String` | `—` |
| `returnLedger[].qty` | `Number` | `required: true` |
| `returnLedger[].signatureDataUrl` | `String` | `required: true` |
| `returnLedger[].signedByName` | `String` | `required: true` |
| `returnLedger[].processedBy` | `String` | `required: true` |
| `signatureEvents` | `Array` | `—` |
| `signatureEvents[].eventId` | `String` | `required: true` |
| `signatureEvents[].eventType` | `String (enum)` | `required: true; enum: ["card_void", "return"]` |
| `signatureEvents[].signedAt` | `Date` | `required: true` |
| `signatureEvents[].signatureDataUrl` | `String` | `required: true` |
| `signatureEvents[].signedByName` | `String` | `required: true` |
| `signatureEvents[].processedBy` | `String` | `required: true` |
| `signatureEvents[].reference` | `String` | `—` |

<a id="model-possession"></a>
### POSSession (`possessions`)

Source: [server/src/models/POSSession.model.ts](server/src/models/POSSession.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `userId` | `ObjectId` | `required: true; ref: "Cashier"; index: true` |
| `terminalId` | `String` | `required: true; default: "default"; index: true` |
| `openingBalance` | `Number` | `required: true; default: 0` |
| `expectedOpeningBalance` | `Number` | `—` |
| `openingDiscrepancy` | `Number` | `—` |
| `closingBalance` | `Number` | `—` |
| `actualCashInDrawer` | `Number` | `—` |
| `closingDiscrepancy` | `Number` | `—` |
| `cashDropAmount` | `Number` | `default: 0` |
| `openingNotes` | `String` | `trim: true` |
| `closingNotes` | `String` | `trim: true` |
| `openingDenominations` | `Object` | `_id: false` |
| `openingDenominations.bills100` | `Number` | `default: 0` |
| `openingDenominations.bills50` | `Number` | `default: 0` |
| `openingDenominations.bills20` | `Number` | `default: 0` |
| `openingDenominations.bills10` | `Number` | `default: 0` |
| `openingDenominations.bills5` | `Number` | `default: 0` |
| `openingDenominations.bills1` | `Number` | `default: 0` |
| `openingDenominations.coins100` | `Number` | `default: 0` |
| `openingDenominations.coins25` | `Number` | `default: 0` |
| `openingDenominations.coins10` | `Number` | `default: 0` |
| `openingDenominations.coins5` | `Number` | `default: 0` |
| `openingDenominations.coins1` | `Number` | `default: 0` |
| `openingDenominations.rollsQuarters` | `Number` | `default: 0` |
| `openingDenominations.rollsDimes` | `Number` | `default: 0` |
| `openingDenominations.rollsNickels` | `Number` | `default: 0` |
| `openingDenominations.rollsPennies` | `Number` | `default: 0` |
| `closingDenominations` | `Object` | `_id: false` |
| `closingDenominations.bills100` | `Number` | `default: 0` |
| `closingDenominations.bills50` | `Number` | `default: 0` |
| `closingDenominations.bills20` | `Number` | `default: 0` |
| `closingDenominations.bills10` | `Number` | `default: 0` |
| `closingDenominations.bills5` | `Number` | `default: 0` |
| `closingDenominations.bills1` | `Number` | `default: 0` |
| `closingDenominations.coins100` | `Number` | `default: 0` |
| `closingDenominations.coins25` | `Number` | `default: 0` |
| `closingDenominations.coins10` | `Number` | `default: 0` |
| `closingDenominations.coins5` | `Number` | `default: 0` |
| `closingDenominations.coins1` | `Number` | `default: 0` |
| `closingDenominations.rollsQuarters` | `Number` | `default: 0` |
| `closingDenominations.rollsDimes` | `Number` | `default: 0` |
| `closingDenominations.rollsNickels` | `Number` | `default: 0` |
| `closingDenominations.rollsPennies` | `Number` | `default: 0` |
| `openedByManagerId` | `ObjectId` | `ref: "Cashier"` |
| `closedByManagerId` | `ObjectId` | `ref: "Cashier"` |
| `status` | `String (enum)` | `default: "open"; enum: ["open", "closed"]; index: true` |
| `openedAt` | `Date` | `default: Date.now` |
| `closedAt` | `Date` | `—` |
| `eodReport` | `Mixed` | `—` |

<a id="model-product"></a>
### Product (`products`)

Source: [server/src/models/Product.model.ts](server/src/models/Product.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `vendorId` | `String` | `required: true; ref: "Vendor"; index: true` |
| `syncType` | `String (enum)` | `enum: ["INHOUSE", "API", "CSV", "FTP"]; index: true` |
| `productMasterSku` | `String` | `trim: true` |
| `name` | `String` | `required: true; minLength: 3; maxLength: 200; trim: true` |
| `description` | `String` | `default: ""` |
| `brand` | `String` | `default: null; ref: "Brand"` |
| `manufacturer` | `String` | `default: null; trim: true` |
| `thumbnail` | `String` | `default: null; trim: true` |
| `category` | `String` | `default: null; ref: "Taxonomy"` |
| `subcategory` | `String` | `default: null; trim: true` |
| `categoryPath` | `Array` | `—` |
| `categoryPath[].id` | `String` | `—` |
| `categoryPath[].name` | `String` | `—` |
| `categoryPath[]._id` | `false` | `—` |
| `status` | `String (enum)` | `default: "active"; enum: ["active", "archived"]` |
| `attributes` | `Array` | `—` |
| `attributes[]` | `Schema.Types.ObjectId` | `ref: "Attribute"` |
| `attributeValues` | `Mixed` | `default: {}` |
| `itemType` | `String (enum)` | `default: "Inventory"; enum: ["Inventory", "Non-inventory", "Service", "Discount"]` |
| `discountable` | `Boolean` | `default: false` |
| `taxable` | `Boolean` | `default: false` |
| `substituteItems` | `Array` | `—` |
| `substituteItems[]` | `Schema.Types.ObjectId` | `ref: "Product"` |
| `additionalDescription1` | `String` | `default: ""` |
| `additionalDescription2` | `String` | `default: ""` |
| `additionalDescription3` | `String` | `default: ""` |
| `taxCategory` | `String` | `default: null; trim: true` |
| `warrentyPeriod1` | `Number` | `default: 0; min: 0` |
| `warrentyPeriod2` | `Number` | `default: 0; min: 0` |
| `mandatoryAlterations` | `Mixed` | `default: []` |
| `isRestrictedItem` | `Boolean` | `default: false; index: true` |
| `restrictedItemPrompt` | `String` | `default: null; trim: true` |
| `barcode` | `String` | `default: null; trim: true` |
| `upc` | `String` | `default: null; trim: true` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ name: 1 }`
- `{ status: 1 }`
- `{ manufacturer: 1 }`
- `{ brand: 1 }`
- `{ category: 1, subcategory: 1 }`
- `{ vendorId: 1 }`
- `{ createdAt: -1 }`
- `{ vendorId: 1, name: 1 }, { unique: false }`
- `{ vendorId: 1, productMasterSku: 1 }, { unique: true, partialFilterExpression: { productMasterSku: { $type: "string" }, }, }`

Middleware declarations: `pre("save") in server/src/models/Product.model.ts at line 152`.

<a id="model-receivingshipment"></a>
### ReceivingShipment (`receiving_shipments`)

Source: [server/src/models/ReceivingShipment.model.ts](server/src/models/ReceivingShipment.model.ts). Schema options: `{ timestamps: true, collection: "receiving_shipments", }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `shipmentNumber` | `String` | `required: true; unique: true; index: true; trim: true; uppercase: true` |
| `poId` | `ObjectId` | `required: true; ref: "VendorPurchaseOrder"; index: true` |
| `poNumber` | `String` | `required: true; index: true; trim: true; uppercase: true` |
| `vendorId` | `String` | `required: true; ref: "Vendor"; index: true` |
| `vendorName` | `String` | `default: ""` |
| `facilityId` | `String` | `required: true; index: true` |
| `warehouseId` | `String` | `default: null; index: true` |
| `packingSlipNumber` | `String` | `required: true; index: true; trim: true` |
| `carrier` | `String` | `default: ""; trim: true` |
| `trackingNumbers` | `Array` | `—` |
| `trackingNumbers[]` | `String` | `trim: true` |
| `packageCartonCount` | `Number` | `default: 1; min: 1` |
| `status` | `String (enum)` | `default: "in_progress"; enum: ["in_progress", "completed", "cancelled"]; index: true` |
| `boxPhotos` | `Array` | `—` |
| `boxPhotos[].photoId` | `String` | `required: true` |
| `boxPhotos[].url` | `String` | `required: true` |
| `boxPhotos[].caption` | `String` | `default: ""` |
| `boxPhotos[].boxNumber` | `String` | `default: ""` |
| `boxPhotos[].category` | `String` | `default: "other"` |
| `boxPhotos[].sku` | `String` | `default: null` |
| `boxPhotos[].variantId` | `ObjectId` | `default: null; ref: "Variant"` |
| `boxPhotos[].uploadedBy` | `String` | `default: "Dock Staff"` |
| `boxPhotos[].uploadedAt` | `Date` | `default: Date.now` |
| `items` | `Array` | `—` |
| `items[].variantId` | `ObjectId` | `required: true; ref: "Variant"` |
| `items[].inventoryId` | `ObjectId` | `ref: "Inventory"` |
| `items[].sku` | `String` | `required: true; trim: true; uppercase: true` |
| `items[].productName` | `String` | `default: ""` |
| `items[].barcode` | `String` | `default: null` |
| `items[].additionalBarcodes` | `Array` | `—` |
| `items[].additionalBarcodes[]` | `String` | `trim: true` |
| `items[].orderedQty` | `Number` | `required: true; min: 0` |
| `items[].shippedQtyReported` | `Number` | `required: true; min: 0` |
| `items[].receivedQty` | `Number` | `default: 0; min: 0` |
| `items[].damagedQty` | `Number` | `default: 0; min: 0` |
| `items[].shortageQty` | `Number` | `default: 0` |
| `items[].overageQty` | `Number` | `default: 0` |
| `items[].costPrice` | `Number` | `default: 0; min: 0` |
| `items[].scanLog` | `Array` | `—` |
| `items[].scanLog[].scanId` | `String` | `required: true` |
| `items[].scanLog[].scannedAt` | `Date` | `default: Date.now` |
| `items[].scanLog[].barcodeScanned` | `String` | `required: true` |
| `items[].scanLog[].scannedBy` | `String` | `default: "Dock Staff"` |
| `recountHistory` | `Array` | `—` |
| `recountHistory[].variantId` | `ObjectId` | `required: true; ref: "Variant"` |
| `recountHistory[].sku` | `String` | `required: true; uppercase: true` |
| `recountHistory[].oldCount` | `Number` | `required: true` |
| `recountHistory[].newCount` | `Number` | `required: true` |
| `recountHistory[].reason` | `String` | `default: ""` |
| `recountHistory[].recountedBy` | `String` | `default: "Dock Staff"` |
| `recountHistory[].timestamp` | `Date` | `default: Date.now` |
| `notes` | `String` | `default: ""` |
| `receivedDate` | `Date` | `default: Date.now` |
| `completedAt` | `Date` | `default: null` |
| `receivedBy` | `String` | `default: "Dock Staff"` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ poId: 1, status: 1 }`
- `{ packingSlipNumber: 1, vendorId: 1 }`
- `{ createdAt: -1 }`

<a id="model-replenishmenttrigger"></a>
### ReplenishmentTrigger (`replenishment_triggers`)

Source: [server/src/models/ReplenishmentTrigger.model.ts](server/src/models/ReplenishmentTrigger.model.ts). Schema options: `{ timestamps: true, collection: "replenishment_triggers", }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `variantId` | `ObjectId` | `required: true; ref: "Variant"` |
| `inventoryId` | `ObjectId` | `required: true; ref: "Inventory"` |
| `vendorId` | `String` | `required: true; ref: "Vendor"; index: true` |
| `vendorName` | `String` | `default: ""` |
| `manufacturer` | `String` | `default: ""; index: true; trim: true` |
| `facilityId` | `String` | `default: null; index: true` |
| `sku` | `String` | `required: true; trim: true; uppercase: true` |
| `productName` | `String` | `default: ""` |
| `qtyAvailable` | `Number` | `required: true` |
| `minQty` | `Number` | `required: true` |
| `targetQty` | `Number` | `default: 0` |
| `qtyOnOrder` | `Number` | `default: 0` |
| `qtyBackordered` | `Number` | `default: 0` |
| `recommendedOrderQty` | `Number` | `required: true; min: 0` |
| `status` | `String (enum)` | `default: "open"; enum: ["open", "po_created", "dismissed"]; index: true` |
| `acknowledged` | `Boolean` | `default: false; index: true` |
| `acknowledgedAt` | `Date` | `default: null` |
| `acknowledgedBy` | `String` | `default: null` |
| `poId` | `ObjectId` | `default: null; ref: "VendorPurchaseOrder"; index: true` |
| `poNumber` | `String` | `default: null` |
| `dismissReason` | `String` | `default: null` |
| `dismissedBy` | `String` | `default: null` |
| `dismissedAt` | `Date` | `default: null` |
| `triggeredAt` | `Date` | `default: Date.now; index: true` |
| `lastEmailSentAt` | `Date` | `default: null` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ variantId: 1 }, { unique: true, partialFilterExpression: { status: "open" } }`
- `{ vendorId: 1, status: 1 }`
- `{ triggeredAt: -1 }`

<a id="model-reportpreset"></a>
### ReportPreset (`reportpresets`)

Source: [server/src/models/ReportPreset.model.ts](server/src/models/ReportPreset.model.ts). Schema options: `{ timestamps: true, strict: false }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `name` | `String` | `required: true` |
| `description` | `String` | `default: ''` |
| `reportType` | `String` | `—` |
| `customTitle` | `String` | `—` |
| `dateRangeType` | `String` | `—` |
| `startDate` | `String` | `—` |
| `endDate` | `String` | `—` |
| `viewMode` | `String` | `—` |
| `summaryOnly` | `Boolean` | `default: false` |
| `filters` | `Mixed` | `default: {}` |
| `domain` | `String` | `—` |
| `audience` | `Mixed` | `—` |
| `modifiers` | `Mixed` | `—` |
| `layout` | `String` | `—` |
| `userId` | `ObjectId` | `ref: 'User'` |

<a id="model-reservation"></a>
### Reservation (`reservations`)

Source: [server/src/models/Reservation.model.ts](server/src/models/Reservation.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `orderId` | `String` | `required: true; index: true` |
| `variantId` | `ObjectId` | `required: true; ref: "Variant"` |
| `inventoryId` | `ObjectId` | `ref: "Inventory"` |
| `qty` | `Number` | `required: true; min: 1` |
| `expiresAt` | `Date` | `required: true` |
| `status` | `String (enum)` | `default: "active"; enum: ["active", "released", "expired"]; index: true` |
| `releasedBy` | `String` | `default: null` |
| `releasedAt` | `Date` | `default: null` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ expiresAt: 1 }, { expireAfterSeconds: 3600 }`
- `{ status: 1, expiresAt: 1 }`

Middleware declarations: `pre("save") in server/src/models/Reservation.model.ts at line 66`.

<a id="model-return"></a>
### Return (`returns`)

Source: [server/src/models/Return.model.ts](server/src/models/Return.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `orderId` | `ObjectId` | `required: true; ref: "Order"` |
| `itemId` | `ObjectId` | `required: true; ref: "Variant"` |
| `qty` | `Number` | `required: true; min: 1` |
| `reason` | `String` | `required: true; minlength: 10; maxlength: 500` |
| `signatureDataUrl` | `String` | `required: true` |
| `signedByName` | `String` | `required: true` |
| `status` | `String (enum)` | `default: "requested"; enum: ["requested", "approved", "rejected", "processed"]; index: true` |
| `restock` | `Boolean` | `default: true` |
| `refundAmount` | `Number` | `min: 0` |
| `processedAt` | `Date` | `—` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ orderId: 1, status: 1 }`

<a id="model-salerule"></a>
### SaleRule (`salerules`)

Source: [server/src/models/SaleRule.model.ts](server/src/models/SaleRule.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `name` | `String` | `required: true; trim: true` |
| `description` | `String` | `default: ""; trim: true` |
| `status` | `String (enum)` | `default: "scheduled"; enum: ["scheduled", "active", "expired", "disabled"]; index: true` |
| `targetType` | `String (enum)` | `required: true; enum: ["CATEGORY", "SUBCATEGORY", "PRODUCT", "CARD_NETWORK", "ALL"]; index: true` |
| `targetCategories` | `Array` | `—` |
| `targetCategories[]` | `String` | `trim: true` |
| `targetProductIds` | `Array` | `—` |
| `targetProductIds[]` | `Schema.Types.ObjectId` | `ref: "Product"` |
| `cardNetwork` | `String (enum)` | `default: null; enum: ["MASTERCARD", "VISA", "AMEX", "DISCOVER"]` |
| `discountType` | `String (enum)` | `required: true; enum: ["PERCENT", "FIXED_PRICE", "FIXED_OFF"]` |
| `discountValue` | `Number` | `required: true; min: 0` |
| `startDateTime` | `Date` | `required: true; index: true` |
| `endDateTime` | `Date` | `required: true; index: true` |
| `priority` | `Number` | `default: 1` |
| `stackWithContractPrice` | `Boolean` | `default: false` |
| `createdBy` | `ObjectId` | `default: null; ref: "User"` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ status: 1, startDateTime: 1, endDateTime: 1 }`
- `{ targetType: 1, status: 1 }`

<a id="model-sizefit"></a>
### SizeFit (`sizefits`)

Source: [server/src/models/SizeFit.model.ts](server/src/models/SizeFit.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `productId` | `ObjectId` | `required: true; ref: "Product"; unique: true` |
| `chartData` | `Map` | `default: {}; of: new mongoose.Schema({ chest: Number, waist: Number, length: Number, shoulder: Number, sleeve: Number, }, { _id: false })` |
| `conversions` | `Mixed` | `default: {}` |
| `unit` | `String (enum)` | `default: "inches"; enum: ["inches", "cm"]` |
| `fitType` | `String (enum)` | `default: "regular"; enum: ["slim", "regular", "loose", "oversized"]` |

<a id="model-sizescale"></a>
### SizeScale (`sizescales`)

Source: [server/src/models/SizeScale.model.ts](server/src/models/SizeScale.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `name` | `String` | `required: true; unique: true; trim: true` |
| `sizes` | `Array` | `—` |
| `sizes[].size` | `String` | `required: true; trim: true` |
| `sizes[].description` | `String` | `trim: true` |
| `sizes[]._id` | `false` | `—` |
| `colors` | `Array` | `—` |
| `colors[].name` | `String` | `required: true; trim: true` |
| `colors[].hex` | `String` | `trim: true` |
| `colors[]._id` | `false` | `—` |

<a id="model-stockingtask"></a>
### StockingTask (`stocking_tasks`)

Source: [server/src/models/StockingTask.model.ts](server/src/models/StockingTask.model.ts). Schema options: `{ timestamps: true, collection: "stocking_tasks", }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `taskId` | `String` | `required: true; unique: true; index: true; trim: true; uppercase: true` |
| `receivingShipmentId` | `ObjectId` | `required: true; ref: "ReceivingShipment"; index: true` |
| `shipmentNumber` | `String` | `required: true; index: true; trim: true; uppercase: true` |
| `poId` | `ObjectId` | `required: true; ref: "VendorPurchaseOrder"; index: true` |
| `poNumber` | `String` | `required: true; index: true; trim: true; uppercase: true` |
| `vendorId` | `String` | `default: ""; index: true` |
| `vendorName` | `String` | `default: ""` |
| `facilityId` | `String` | `required: true; index: true` |
| `warehouseId` | `String` | `required: true; index: true` |
| `status` | `String (enum)` | `default: "pending"; enum: ["pending", "in_progress", "completed", "cancelled"]; index: true` |
| `items` | `Array` | `—` |
| `items[].variantId` | `ObjectId` | `required: true; ref: "Variant"` |
| `items[].inventoryId` | `ObjectId` | `ref: "Inventory"` |
| `items[].sku` | `String` | `required: true; trim: true; uppercase: true` |
| `items[].productName` | `String` | `default: ""` |
| `items[].totalReceivedQty` | `Number` | `required: true; min: 1` |
| `items[].totalStockedQty` | `Number` | `default: 0; min: 0` |
| `items[].remainingToStockQty` | `Number` | `required: true; min: 0` |
| `items[].isCustomerAllocated` | `Boolean` | `default: false` |
| `items[].customerAllocationId` | `ObjectId` | `default: null; ref: "CustomerAllocation"` |
| `items[].customerOrderReference` | `String` | `default: null` |
| `items[].customerName` | `String` | `default: null` |
| `items[].suggestedLocation` | `Object` | `—` |
| `items[].suggestedLocation.binId` | `String` | `default: null` |
| `items[].suggestedLocation.boxId` | `String` | `default: null` |
| `items[].suggestedLocation.rack` | `String` | `default: null` |
| `items[].suggestedLocation.locationPath` | `String` | `default: null` |
| `items[].placements` | `Array` | `—` |
| `items[].placements[].placementId` | `String` | `required: true` |
| `items[].placements[].warehouseId` | `String` | `required: true` |
| `items[].placements[].binId` | `String` | `required: true` |
| `items[].placements[].boxId` | `String` | `default: null` |
| `items[].placements[].quantity` | `Number` | `required: true; min: 1` |
| `items[].placements[].placedAt` | `Date` | `default: Date.now` |
| `items[].placements[].placedBy` | `String` | `default: "Warehouse Staff"` |
| `totalItems` | `Number` | `default: 0` |
| `totalQty` | `Number` | `default: 0` |
| `stockedQty` | `Number` | `default: 0` |
| `assignedTo` | `String` | `default: null` |
| `completedAt` | `Date` | `default: null` |
| `notes` | `String` | `default: ""` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ facilityId: 1, status: 1 }`
- `{ warehouseId: 1, status: 1 }`

Middleware declarations: `pre("save") in server/src/models/StockingTask.model.ts at line 132`.

<a id="model-stockingtransaction"></a>
### StockingTransaction (`stocking_transactions`)

Source: [server/src/models/StockingTransaction.model.ts](server/src/models/StockingTransaction.model.ts). Schema options: `{ timestamps: true, collection: "stocking_transactions", }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `taskId` | `ObjectId` | `required: true; ref: "StockingTask"; index: true` |
| `taskCode` | `String` | `required: true; index: true; trim: true; uppercase: true` |
| `receivingShipmentId` | `ObjectId` | `default: null; ref: "ReceivingShipment"; index: true` |
| `variantId` | `ObjectId` | `required: true; ref: "Variant"; index: true` |
| `sku` | `String` | `required: true; index: true; trim: true; uppercase: true` |
| `vendorId` | `String` | `default: null; index: true` |
| `vendorName` | `String` | `default: null` |
| `poNumber` | `String` | `default: null; index: true` |
| `productName` | `String` | `default: null` |
| `manufacturer` | `String` | `default: null` |
| `facilityId` | `String` | `required: true; index: true` |
| `warehouseId` | `String` | `required: true; index: true` |
| `binId` | `String` | `required: true; index: true` |
| `boxId` | `String` | `default: null; index: true` |
| `quantity` | `Number` | `required: true; min: 1` |
| `isCustomerAllocated` | `Boolean` | `default: false; index: true` |
| `customerAllocationId` | `ObjectId` | `default: null; ref: "CustomerAllocation"` |
| `customerOrderReference` | `String` | `default: null` |
| `customerName` | `String` | `default: null` |
| `placedBy` | `String` | `default: "Warehouse Staff"` |
| `placedAt` | `Date` | `default: Date.now; index: true` |
| `qrPayloadScanned` | `String` | `default: null` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ warehouseId: 1, binId: 1, boxId: 1 }`
- `{ placedAt: -1 }`

<a id="model-stockmovement"></a>
### StockMovement (`stockmovements`)

Source: [server/src/models/StockMovement.model.ts](server/src/models/StockMovement.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `movementNumber` | `String` | `required: true; unique: true; index: true` |
| `movementType` | `String (enum)` | `default: "transfer"; enum: ["transfer", "restock", "adjustment", "relocation", "receiving", "stocking_transfer", "recount_adjustment"]` |
| `sourceLocationId` | `String` | `required: true; index: true` |
| `sourceLocationName` | `String` | `required: true` |
| `destLocationId` | `String` | `required: true; index: true` |
| `destLocationName` | `String` | `required: true` |
| `facilityId` | `String` | `index: true` |
| `sourceFacilityId` | `String` | `index: true` |
| `sourceFacilityName` | `String` | `—` |
| `destFacilityId` | `String` | `index: true` |
| `destFacilityName` | `String` | `—` |
| `sourceLocationType` | `String` | `—` |
| `destLocationType` | `String` | `—` |
| `sourceRack` | `String` | `—` |
| `sourceBinId` | `String` | `—` |
| `sourceBoxId` | `String` | `—` |
| `destRack` | `String` | `—` |
| `destBinId` | `String` | `—` |
| `destBoxId` | `String` | `—` |
| `sourceHierarchyPath` | `String` | `—` |
| `destHierarchyPath` | `String` | `—` |
| `items` | `Array` | `—` |
| `items[].inventoryId` | `ObjectId` | `ref: "Inventory"` |
| `items[].variantId` | `ObjectId` | `ref: "Variant"` |
| `items[].productId` | `ObjectId` | `ref: "Product"` |
| `items[].sku` | `String` | `required: true` |
| `items[].productName` | `String` | `default: ""` |
| `items[].quantity` | `Number` | `required: true; min: 1` |
| `items[].fromBinId` | `String` | `—` |
| `items[].fromBoxId` | `String` | `—` |
| `items[].fromRack` | `String` | `—` |
| `items[].toBinId` | `String` | `—` |
| `items[].toBoxId` | `String` | `—` |
| `items[].toRack` | `String` | `—` |
| `totalQuantity` | `Number` | `required: true` |
| `status` | `String (enum)` | `default: "completed"; enum: ["completed", "cancelled"]` |
| `initiatedBy` | `String` | `default: "IMS User"` |
| `notes` | `String` | `—` |

<a id="model-synclog"></a>
### SyncLog (`synclogs`)

Source: [server/src/models/SyncLog.model.ts](server/src/models/SyncLog.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `syncId` | `String` | `required: true; unique: true; index: true` |
| `vendorId` | `String` | `required: true; index: true` |
| `startTime` | `Date` | `required: true` |
| `endTime` | `Date` | `—` |
| `status` | `String (enum)` | `default: 'PENDING'; enum: ['PENDING', 'SUCCESS', 'FAILED']` |
| `fetchedItems` | `Number` | `default: 0` |
| `validRecords` | `Number` | `default: 0` |
| `invalidRecords` | `Number` | `default: 0` |
| `created` | `Number` | `default: 0` |
| `updated` | `Number` | `default: 0` |
| `skipped` | `Number` | `default: 0` |
| `errorsMessage` | `Array<String>` | `—` |
| `attempts` | `Number` | `default: 1` |
| `rowsProcessed` | `Number` | `default: 0` |
| `rowsTotal` | `Number` | `default: 0` |
| `progressPercent` | `Number` | `default: 0` |

<a id="model-syncrundetail"></a>
### SyncRunDetail (`syncrundetails`)

Source: [server/src/models/SyncRunDetail.model.ts](server/src/models/SyncRunDetail.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `syncId` | `String` | `required: true; index: true` |
| `vendorId` | `String` | `required: true; index: true` |
| `rowIndex` | `Number` | `required: true` |
| `vendorSku` | `String` | `required: true` |
| `productName` | `String` | `—` |
| `status` | `String (enum)` | `required: true; enum: ["success", "failed"]` |
| `productId` | `ObjectId` | `default: null; ref: "Product"` |
| `variantId` | `ObjectId` | `default: null; ref: "Variant"` |
| `errorMessage` | `String` | `—` |
| `failureReason` | `String (enum)` | `default: null; enum: ["validation", "mapping", "create_error", "unknown"]` |
| `rawSnapshot` | `Mixed` | `—` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ vendorId: 1, syncId: 1 }`
- `{ vendorId: 1, productId: 1 }`

<a id="model-systemsettings"></a>
### SystemSettings (`systemsettings`)

Source: [server/src/models/SystemSettings.model.ts](server/src/models/SystemSettings.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `receiptLogoUrl` | `String` | `default: ""` |
| `reportLogoUrl` | `String` | `default: ""` |
| `receiptPhoneNumber` | `String` | `default: ""` |
| `receiptAddress` | `String` | `default: ""` |
| `receiptReturnPolicy` | `String` | `default: ""` |
| `receiptFooterText` | `String` | `default: "THANK YOU"` |
| `reportFooterText` | `String` | `default: "RETURN POLICY: VALID ONLY WITH RECEIPT,\nUP TO 30 DAYS AFTER PURCHASE,\nMUST BE UNUSED, UNALTERED,\nWITH ORIGINAL PACKAGING/TAGS.\nThank You For Your Business!"` |
| `invoiceCompanyName` | `String` | `default: "CHICAGO UNIFORM"` |
| `invoiceCompanyAddress` | `String` | `default: "222 W 22nd Street Suite 114\nChicago, IL 60616"` |
| `invoiceCompanyContact` | `String` | `default: "(312) 326-5800 \| sales@chicagouniform.com"` |
| `invoiceCompanyPhone` | `String` | `default: ""` |
| `invoiceCompanyEmail` | `String` | `default: ""` |
| `achInstructions` | `String` | `default: "ACH Transfer:\nBank: First National Bank\nRouting #: 071000013\nAccount #: 1234567890\nAccount Name: Chicago Uniform Company"` |
| `checkInstructions` | `String` | `default: "Make checks payable to: Chicago Uniform Company\nMail to: 222 W 22nd Street Suite 114, Chicago, IL 60616"` |
| `defaultInvoiceNotes` | `String` | `default: ""` |
| `inactiveUserThresholdDays` | `Number` | `default: 30` |
| `enableInactiveAutoFlag` | `Boolean` | `default: true` |
| `imsUserThresholdDays` | `Number` | `default: 30` |
| `cashierThresholdDays` | `Number` | `default: 30` |
| `companyUserThresholdDays` | `Number` | `default: 30` |
| `batchCutOffHour` | `Number` | `default: 23` |
| `batchCutOffMinute` | `Number` | `default: 59` |
| `lowStockAlertEmail` | `String` | `default: ""; trim: true` |
| `enableLowStockEmailAlerts` | `Boolean` | `default: true` |
| `lowStockEmailFrequency` | `String (enum)` | `default: "1h"; enum: ["instant", "30m", "1h", "4h", "daily", "custom"]` |
| `customEmailCooldownMinutes` | `Number` | `default: 60; min: 1; max: 43200` |
| `alwaysNotifyZeroStockInstant` | `Boolean` | `default: true` |
| `lastLowStockDigestSentAt` | `Date` | `default: null` |

<a id="model-taxonomy"></a>
### Taxonomy (`taxonomies`)

Source: [server/src/models/Taxonomy.model.ts](server/src/models/Taxonomy.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `category` | `String` | `required: true; unique: true; trim: true` |
| `subcategories` | `Array` | `—` |
| `subcategories[].name` | `String` | `required: true` |
| `subcategories[].description` | `String` | `—` |
| `subcategories[].default` | `Object` | `—` |
| `parentCategory` | `ObjectId` | `default: null; ref: "Taxonomy"` |
| `level` | `Number` | `default: 0` |
| `productIds` | `Array` | `—` |
| `productIds[]` | `Schema.Types.ObjectId` | `ref: "Product"; default: undefined` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ parentCategory: 1 }`

Middleware declarations: `pre("save") in server/src/models/Taxonomy.model.ts at line 52`.

<a id="model-ticketadjustment"></a>
### TicketAdjustment (`ticketadjustments`)

Source: [server/src/models/TicketAdjustment.model.ts](server/src/models/TicketAdjustment.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `posOrderId` | `ObjectId` | `required: true; ref: "PosOrder"; index: true` |
| `invoiceId` | `ObjectId` | `ref: "Invoice"; index: true` |
| `adjustmentType` | `String (enum)` | `required: true; enum: ["additional_charge", "void_reissue", "credit_refund"]` |
| `amount` | `Number` | `required: true; min: 0` |
| `reason` | `String` | `required: true` |
| `batchStatus` | `String (enum)` | `required: true; enum: ["pre_batch", "post_batch"]` |
| `processorTxnId` | `String` | `—` |
| `processedBy` | `String` | `required: true` |
| `processedAt` | `Date` | `default: Date.now` |
| `status` | `String (enum)` | `default: "completed"; enum: ["pending", "completed", "failed"]` |
| `failureReason` | `String` | `—` |

<a id="model-user"></a>
### User (`users`)

Source: [server/src/models/User.model.ts](server/src/models/User.model.ts). Schema options: `{ timestamps: true, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `officerId` | `String` | `required: true; unique: true; index: true; trim: true` |
| `username` | `String` | `unique: true; index: true; sparse: true; trim: true; lowercase: true` |
| `email` | `String` | `required: true; unique: true; index: true; trim: true; lowercase: true` |
| `password` | `String` | `required: true; select: false` |
| `name` | `String` | `required: true; trim: true` |
| `dateOfBirth` | `Date` | `—` |
| `allotmentRolloverDate` | `Date` | `—` |
| `portalSettings` | `Array` | `—` |
| `portalSettings[].portalId` | `ObjectId` | `required: true; ref: "Page"` |
| `portalSettings[].role` | `String (enum)` | `enum: ["super_admin", "portal_admin", "officer"]` |
| `portalSettings[].permissions` | `Array<String>` | `default: []` |
| `portalSettings[].employeeGroupIds` | `Array` | `—` |
| `portalSettings[].employeeGroupIds[]` | `Schema.Types.ObjectId` | `ref: "EmployeeGroup"` |
| `portalSettings[].rank` | `String` | `trim: true` |
| `portalSettings[].anniversaryDate` | `Date` | `—` |
| `portalSettings[].inviteSent` | `Boolean` | `default: false` |
| `portalSettings[].renewalType` | `String (enum)` | `enum: ["annual", "monthly", "auto", "none"]` |
| `portalSettings[].renewalDate` | `Date` | `—` |
| `portalSettings[].renewalDateType` | `String (enum)` | `enum: ["anniversarydate", "customdate"]` |
| `portalSettings[].customRenewalDate` | `Date` | `—` |
| `portalSettings[].periodSubType` | `String (enum)` | `enum: ["from_creation", "calendar_start"]` |
| `portalSettings[].autoDateField` | `String (enum)` | `enum: ["dateOfBirth", "anniversaryDate"]` |
| `portalSettings[].autoDateValue` | `Date` | `—` |
| `policeStation` | `Object` | `—` |
| `policeStation.name` | `String` | `—` |
| `policeStation.address` | `String` | `—` |
| `policeStation.district` | `String` | `—` |
| `policeStation.state` | `String` | `—` |
| `policeStation.pincode` | `String` | `—` |
| `personalAddress` | `Object` | `—` |
| `personalAddress.street` | `String` | `—` |
| `personalAddress.city` | `String` | `—` |
| `personalAddress.state` | `String` | `—` |
| `personalAddress.pincode` | `String` | `—` |
| `personalAddress.phone` | `String` | `—` |
| `discountPercent` | `Number` | `default: 0; min: 0; max: 100` |
| `isTaxExempt` | `Boolean` | `default: false` |
| `taxId` | `String` | `default: ""` |
| `taxExemptCategory` | `String` | `default: "none"` |
| `sizeInfo` | `Object` | `—` |
| `sizeInfo.standardSize` | `String (enum)` | `enum: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"]` |
| `sizeInfo.height` | `Number` | `—` |
| `sizeInfo.weight` | `Number` | `—` |
| `sizeInfo.chest` | `Number` | `—` |
| `sizeInfo.waist` | `Number` | `—` |
| `sizeInfo.shoulder` | `Number` | `—` |
| `sizeInfo.armLength` | `Number` | `—` |
| `sizeInfo.inseam` | `Number` | `—` |
| `sizeInfo.shoeSize` | `String` | `—` |
| `assignedPortals` | `Array` | `—` |
| `assignedPortals[]` | `Schema.Types.ObjectId` | `ref: "Page"` |
| `employeeGroupIds` | `Array` | `—` |
| `employeeGroupIds[]` | `Schema.Types.ObjectId` | `ref: "EmployeeGroup"; index: true` |
| `department` | `String` | `trim: true` |
| `assignedLocationId` | `ObjectId` | `ref: "Location"; index: true; sparse: true` |
| `locations` | `Array<String>` | `default: []; validate: { validator: (v: string[]) => v.length <= 3, message: "User can have at most 3 locations", }` |
| `isFloater` | `Boolean` | `default: false` |
| `contact` | `Array` | `default: []` |
| `contact[]` | `{ type: String, trim: true }` | `phone: { type: String, trim: true }` |
| `contact[].type` | `String` | `—` |
| `contact[].trim` | `true` | `—` |
| `creditAccount` | `ObjectId` | `ref: "Credit"` |
| `managedOfficers` | `Array` | `—` |
| `managedOfficers[].officerId` | `ObjectId` | `ref: "User"` |
| `managedOfficers[].email` | `String` | `—` |
| `managedOfficers[].assignedAt` | `Date` | `default: Date.now` |
| `purchasesForOfficers` | `Array` | `—` |
| `purchasesForOfficers[].orderId` | `ObjectId` | `ref: "Order"` |
| `purchasesForOfficers[].officerId` | `ObjectId` | `ref: "User"` |
| `purchasesForOfficers[].amount` | `Number` | `—` |
| `purchasesForOfficers[].createdAt` | `Date` | `default: Date.now` |
| `status` | `String (enum)` | `default: "active"; enum: ["active", "inactive"]; index: true` |
| `isActive` | `Boolean` | `default: true` |
| `isVerified` | `Boolean` | `default: false` |
| `lastLoginAt` | `Date` | `—` |
| `isOnLeave` | `Boolean` | `default: false` |
| `leaveStartDate` | `Date` | `—` |
| `leaveEndDate` | `Date` | `—` |
| `leaveNotes` | `String` | `trim: true` |
| `employmentConfirmedAt` | `Date` | `—` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ role: 1, isActive: 1 }`
- `{ status: 1, role: 1 }`
- `{ assignedPortals: 1 }`
- `{ tenantId: 1 }`
- `{ employeeGroupIds: 1 }`
- `{ "portalRenewalConfigs.portalId": 1 }`

Middleware declarations: `pre("save") in server/src/models/User.model.ts at line 457`.

<a id="model-usertenantrelationship"></a>
### UserTenantRelationship (`usertenantrelationships`)

Source: [server/src/models/UserTenantRelationship.model.ts](server/src/models/UserTenantRelationship.model.ts). Schema options: `{ timestamps: true, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `userId` | `ObjectId` | `required: true; ref: "User"; index: true` |
| `pageId` | `ObjectId` | `required: true; ref: "Page"; index: true` |
| `role` | `String (enum)` | `required: true; enum: ["vendor", "admin", "employee"]; index: true` |
| `pageIds` | `Array` | `—` |
| `pageIds[]` | `Schema.Types.ObjectId` | `ref: "Page"` |
| `employeeGroupId` | `ObjectId` | `ref: "EmployeeGroup"; index: true; sparse: true` |
| `isActive` | `Boolean` | `default: true; index: true` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ userId: 1, pageId: 1 }, { unique: true }`
- `{ pageId: 1, role: 1 }`
- `{ userId: 1, isActive: 1 }`
- `{ pageId: 1, isActive: 1 }`
- `{ employeeGroupId: 1 }`

Middleware declarations: `pre("save") in server/src/models/UserTenantRelationship.model.ts at line 90`; `pre("save") in server/src/models/UserTenantRelationship.model.ts at line 102`.

<a id="model-variant"></a>
### Variant (`variants`)

Source: [server/src/models/Variant.model.ts](server/src/models/Variant.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `productId` | `ObjectId` | `required: true; ref: "Product"; index: true` |
| `vendorId` | `String` | `required: true; ref: "Vendor"; index: true` |
| `sku` | `String` | `required: true; index: true; uppercase: true` |
| `masterSku` | `String` | `required: true; uppercase: true` |
| `size` | `String` | `required: false; default: null` |
| `color` | `Array` | `—` |
| `color[]` | `String` | `lowercase: true; required: false` |
| `length` | `String` | `required: false; default: null` |
| `lengthName` | `String` | `required: false; default: null` |
| `colorNum` | `String` | `required: false; default: null` |
| `price` | `Number` | `required: true; default: 0; min: 0` |
| `originalPrice` | `Number` | `default: 0; min: 0` |
| `shippingCost` | `Number` | `default: 0; min: 0` |
| `extraCosts` | `Array` | `default: []` |
| `extraCosts[].name` | `String` | `default: ""` |
| `extraCosts[].value` | `Number` | `default: 0; min: 0` |
| `lastPrice` | `Number` | `default: 0; min: 0` |
| `regularPrice` | `Number` | `default: null; min: 0` |
| `costPrice` | `Number` | `default: 0; min: 0` |
| `lastCost` | `Number` | `default: null; min: 0` |
| `alternatePrice1` | `Number` | `default: null; min: 0` |
| `alternatePrice2` | `Number` | `default: null; min: 0` |
| `alternatePrice3` | `Number` | `default: null; min: 0` |
| `images` | `Array` | `—` |
| `images[]` | `String` | `—` |
| `upc` | `String` | `default: null; trim: true` |
| `barcode` | `String` | `default: null; trim: true` |
| `additionalBarcodes` | `Array` | `—` |
| `additionalBarcodes[]` | `String` | `trim: true` |
| `manufacturerItemNo` | `String` | `default: null; trim: true; uppercase: true` |
| `map` | `Number` | `default: null; min: 0` |
| `additionalAttributes` | `Mixed` | `default: {}` |
| `sortOrder` | `Number` | `default: null` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ productId: 1 }`
- `{ vendorId: 1, sku: 1 }, { unique: true }`
- `{ masterSku: 1 }, { unique: true }`
- `{ price: 1 }`
- `{ color: 1 }`
- `{ additionalBarcodes: 1 }`
- `{ manufacturerItemNo: 1 }, { sparse: true }`

Middleware declarations: `pre("save") in server/src/models/Variant.model.ts at line 130`.

<a id="model-vendor"></a>
### Vendor (`vendors`)

Source: [server/src/models/Vendor.model.ts](server/src/models/Vendor.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `vendorId` | `String` | `required: true; unique: true; index: true` |
| `name` | `String` | `required: true` |
| `syncType` | `String (enum)` | `required: true; enum: ["API", "FTP", "CSV", "INHOUSE"]` |
| `isActive` | `Boolean` | `default: true` |
| `leadTimeDays` | `Number` | `default: 7` |
| `minimumOrderValue` | `Number` | `default: 0` |
| `freeFreightMinimum` | `Number` | `default: 0` |
| `contactEmail` | `String` | `default: ""` |
| `connection` | `Object` | `—` |
| `connection.apiUrl` | `String` | `—` |
| `connection.apiKey` | `String` | `—` |
| `connection.ftpHost` | `String` | `—` |
| `connection.ftpUser` | `String` | `—` |
| `connection.ftpPassword` | `String` | `—` |
| `connection.ftpPath` | `String` | `—` |
| `connection.ftpPort` | `Number` | `default: 21` |
| `connection.ftpSecure` | `Boolean` | `default: false` |
| `validationRules` | `Object` | `—` |
| `validationRules.requiredFields` | `Array<String>` | `—` |
| `retryPolicy` | `Object` | `—` |
| `retryPolicy.maxAttempts` | `Number` | `default: 3` |
| `retryPolicy.retryIntervalMinutes` | `Number` | `default: 15` |
| `fieldMappings` | `Array` | `—` |
| `fieldMappings[].vendorField` | `String` | `—` |
| `fieldMappings[].unifiedField` | `String` | `—` |
| `fieldMappings[].confidence` | `Number` | `—` |
| `fieldMappings[].method` | `String` | `—` |
| `fieldMappings[].lastUpdated` | `Date` | `default: Date.now` |
| `mappingStats` | `Object` | `—` |
| `mappingStats.totalFields` | `Number` | `—` |
| `mappingStats.mappedFields` | `Number` | `—` |
| `mappingStats.unmappedFields` | `Array<String>` | `—` |
| `mappingStats.lastSyncDate` | `Date` | `—` |
| `mappingStats.mappingAccuracy` | `Number` | `—` |
| `poExportProfile` | `Object` | `—` |
| `poExportProfile._id` | `false` | `—` |
| `poExportProfile.method` | `String (enum)` | `default: "email_both"; enum: ["email_both", "email_csv", "email_pdf", "ftp_both", "ftp_csv", "ftp_pdf", "api", "manual"]` |
| `poExportProfile.email` | `Object` | `—` |
| `poExportProfile.email._id` | `false` | `—` |
| `poExportProfile.email.to` | `Array<String>` | `—` |
| `poExportProfile.email.cc` | `Array<String>` | `—` |
| `poExportProfile.email.subjectTemplate` | `String` | `—` |
| `poExportProfile.email.bodyTemplate` | `String` | `—` |
| `poExportProfile.csvTemplate` | `Object` | `—` |
| `poExportProfile.csvTemplate._id` | `false` | `—` |
| `poExportProfile.csvTemplate.columns` | `Array` | `—` |
| `poExportProfile.csvTemplate.columns[]._id` | `false` | `—` |
| `poExportProfile.csvTemplate.columns[].field` | `String` | `—` |
| `poExportProfile.csvTemplate.columns[].header` | `String` | `—` |
| `poExportProfile.csvTemplate.columns[].order` | `Number` | `—` |
| `poExportProfile.csvTemplate.columns[].format` | `String` | `—` |
| `poExportProfile.csvTemplate.delimiter` | `String` | `default: ","` |
| `poExportProfile.csvTemplate.includeHeader` | `Boolean` | `default: true` |
| `poExportProfile.csvTemplate.fileNamePattern` | `String` | `—` |
| `poExportProfile.ftp` | `Object` | `—` |
| `poExportProfile.ftp._id` | `false` | `—` |
| `poExportProfile.ftp.host` | `String` | `—` |
| `poExportProfile.ftp.port` | `Number` | `default: 21` |
| `poExportProfile.ftp.user` | `String` | `—` |
| `poExportProfile.ftp.password` | `String` | `—` |
| `poExportProfile.ftp.directory` | `String` | `default: "/orders"` |
| `poExportProfile.ftp.path` | `String` | `—` |
| `poExportProfile.ftp.secure` | `Boolean` | `default: false` |
| `poExportProfile.ftp.passive` | `Boolean` | `default: true` |
| `poExportProfile.ftpConfig` | `Object` | `—` |
| `poExportProfile.ftpConfig._id` | `false` | `—` |
| `poExportProfile.ftpConfig.host` | `String` | `—` |
| `poExportProfile.ftpConfig.port` | `Number` | `default: 21` |
| `poExportProfile.ftpConfig.user` | `String` | `—` |
| `poExportProfile.ftpConfig.password` | `String` | `—` |
| `poExportProfile.ftpConfig.directory` | `String` | `default: "/orders"` |
| `poExportProfile.ftpConfig.path` | `String` | `—` |
| `poExportProfile.ftpConfig.credentialsRef` | `String` | `—` |
| `poExportProfile.ftpConfig.passive` | `Boolean` | `default: true` |
| `poExportProfile.ftpConfig.secure` | `Boolean` | `default: false` |
| `poExportProfile.apiConfig` | `Object` | `—` |
| `poExportProfile.apiConfig._id` | `false` | `—` |
| `poExportProfile.apiConfig.endpoint` | `String` | `—` |
| `poExportProfile.apiConfig.method` | `String` | `—` |
| `poExportProfile.apiConfig.headers` | `Mixed` | `—` |
| `poExportProfile.apiConfig.payloadTemplate` | `Mixed` | `—` |
| `poExportProfile.apiConfig.timeoutMs` | `Number` | `—` |
| `purchasingContacts` | `Array` | `—` |
| `purchasingContacts[].name` | `String` | `—` |
| `purchasingContacts[].email` | `String` | `—` |
| `purchasingContacts[].phone` | `String` | `—` |
| `purchasingContacts[].role` | `String` | `—` |

<a id="model-vendormapping"></a>
### VendorMapping (`vendormappings`)

Source: [server/src/models/VendorMapping.model.ts](server/src/models/VendorMapping.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `vendorId` | `String` | `required: true; index: true` |
| `unified` | `Object` | `—` |
| `unified.item_number` | `String` | `—` |
| `unified.item_description` | `String` | `—` |
| `unified.category` | `String` | `—` |
| `unified.brand` | `String` | `—` |
| `unified.retail_price` | `Number` | `—` |
| `unified.quantity_on_hand` | `Number` | `—` |
| `unified.color` | `String` | `—` |
| `unified.size` | `String` | `—` |
| `vendor_data` | `Map` | `of: Schema.Types.Mixed` |
| `mappings` | `Array` | `—` |
| `mappings[].vendorField` | `String` | `—` |
| `mappings[].unified` | `String` | `—` |
| `mappings[].confidence` | `Number` | `—` |
| `mappings[].method` | `String` | `—` |
| `unmapped` | `Array<String>` | `—` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ "unified.item_number": 1 }`
- `{ "unified.category": 1 }`
- `{ "unified.brand": 1 }`
- `{ vendorId: 1, "vendor_data.vendor_sku": 1 }, { unique: true, sparse: true }`

<a id="model-vendorpurchaseorder"></a>
### VendorPurchaseOrder (`vendor_purchase_orders`)

Source: [server/src/models/VendorPurchaseOrder.model.ts](server/src/models/VendorPurchaseOrder.model.ts). Schema options: `{ timestamps: true, collection: "vendor_purchase_orders", }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `poNumber` | `String` | `required: true; unique: true; index: true; trim: true; uppercase: true` |
| `vendorId` | `String` | `required: true; ref: "Vendor"; index: true` |
| `vendorName` | `String` | `default: ""` |
| `facilityId` | `String` | `required: true; index: true` |
| `warehouseId` | `String` | `default: null; index: true` |
| `status` | `String (enum)` | `default: "draft"; enum: [ "draft", "vendor_inquiry", "pending_approval", "approved", "submitted", "submission_failed", "acknowledged", "in_transit", "partially_received", "received", "closed", "cancelled", ]; index: true` |
| `items` | `Array` | `—` |
| `items[].variantId` | `ObjectId` | `required: true; ref: "Variant"` |
| `items[].inventoryId` | `ObjectId` | `ref: "Inventory"` |
| `items[].productId` | `ObjectId` | `ref: "Product"` |
| `items[].sku` | `String` | `required: true; trim: true; uppercase: true` |
| `items[].productName` | `String` | `default: ""` |
| `items[].brand` | `String` | `default: ""` |
| `items[].size` | `String` | `default: ""` |
| `items[].color` | `String` | `default: ""` |
| `items[].length` | `String` | `default: ""` |
| `items[].upc` | `String` | `default: null` |
| `items[].manufacturerItemNo` | `String` | `default: null` |
| `items[].systemSuggestedQty` | `Number` | `default: 0; min: 0` |
| `items[].customerBackorderQty` | `Number` | `default: 0; min: 0` |
| `items[].manualBufferQty` | `Number` | `default: 0; min: 0` |
| `items[].orderedQty` | `Number` | `default: 0` |
| `items[].finalOrderQty` | `Number` | `required: true; min: 1` |
| `items[].costPrice` | `Number` | `required: true; min: 0` |
| `items[].totalLineCost` | `Number` | `default: 0; min: 0` |
| `items[].receivedQty` | `Number` | `default: 0; min: 0` |
| `items[].cancelledQty` | `Number` | `default: 0; min: 0` |
| `items[].vendorAvailability` | `Object` | `—` |
| `items[].vendorAvailability.availableNow` | `Number` | `default: null` |
| `items[].vendorAvailability.backorderQty` | `Number` | `default: null` |
| `items[].vendorAvailability.estimatedShipDate` | `Date` | `default: null` |
| `items[].vendorAvailability.actionChoice` | `String (enum)` | `default: null; enum: ["ship_now_backorder_rest", "hold_entire_line", "cancel_shortage", null]` |
| `items[].vendorAvailability.notes` | `String` | `default: ""` |
| `items[].customerAllocations` | `Array` | `—` |
| `items[].customerAllocations[].allocationId` | `ObjectId` | `ref: "CustomerAllocation"` |
| `items[].customerAllocations[].sourceType` | `String (enum)` | `required: true; enum: ["portal_order", "pos_order"]` |
| `items[].customerAllocations[].sourceOrderId` | `ObjectId` | `required: true` |
| `items[].customerAllocations[].orderReference` | `String` | `required: true` |
| `items[].customerAllocations[].customerName` | `String` | `default: ""` |
| `items[].customerAllocations[].qty` | `Number` | `required: true; min: 1` |
| `subtotal` | `Number` | `default: 0; min: 0` |
| `discountAmount` | `Number` | `default: 0; min: 0` |
| `shippingCost` | `Number` | `default: 0; min: 0` |
| `taxAmount` | `Number` | `default: 0; min: 0` |
| `totalAmount` | `Number` | `default: 0; min: 0` |
| `totalCost` | `Number` | `default: 0; min: 0` |
| `transmissionMethod` | `String (enum)` | `default: "email_both"; enum: ["email_both", "email_csv", "email_pdf", "ftp_both", "ftp_csv", "ftp_pdf", "vendor_api", "api", "manual"]` |
| `submittedAt` | `Date` | `default: null` |
| `submittedBy` | `String` | `default: null` |
| `submissionHistory` | `Array` | `—` |
| `submissionHistory[].attemptNumber` | `Number` | `required: true` |
| `submissionHistory[].timestamp` | `Date` | `default: Date.now` |
| `submissionHistory[].method` | `String` | `required: true` |
| `submissionHistory[].recipient` | `String` | `required: true` |
| `submissionHistory[].status` | `String (enum)` | `required: true; enum: ["success", "failed"]` |
| `submissionHistory[].errorMessage` | `String` | `default: null` |
| `submissionHistory[].initiatedBy` | `String` | `default: "system"` |
| `submissionHistory[].payloadSummary` | `String` | `default: ""` |
| `vendorInquiryNotes` | `String` | `default: ""` |
| `vendorInquiryDate` | `Date` | `default: null` |
| `expectedDeliveryDate` | `Date` | `default: null` |
| `notes` | `String` | `default: ""` |
| `tags` | `Array` | `—` |
| `tags[]` | `String` | `trim: true` |
| `createdBy` | `String` | `default: "system"` |
| `updatedBy` | `String` | `default: null` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ vendorId: 1, status: 1 }`
- `{ facilityId: 1, status: 1 }`
- `{ createdAt: -1 }`

Middleware declarations: `pre("save") in server/src/models/VendorPurchaseOrder.model.ts at line 221`.

<a id="model-vendoruser"></a>
### VendorUser (`vendorusers`)

Source: [server/src/models/VendorUser.model.ts](server/src/models/VendorUser.model.ts). Schema options: `{ timestamps: true, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `employeeId` | `String` | `index: true; sparse: true; trim: true` |
| `name` | `String` | `required: [true, "Name is required"]; minlength: [2, "Name must be at least 2 characters"]; maxlength: [100, "Name cannot exceed 100 characters"]; trim: true` |
| `username` | `String` | `trim: true; lowercase: true` |
| `email` | `String` | `index: true; trim: true; lowercase: true; validate: { validator: function (v: string) { if (!v \|\| v.trim() === "") return true; return /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/.test(v); }, message: "Please provide a valid email address", }` |
| `password` | `String` | `required: [true, "Password is required"]; minlength: [8, "Password must be at least 8 characters"]; select: false` |
| `phoneNumber` | `String` | `trim: true; validate: { validator: function (v: string) { if (!v \|\| v.trim() === "") return true; return /^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{2,5}[-\s\.]?[0-9]{3,7}$/.test(v.replace(/\s+/g, "")); }, message: "Please provide a valid phone number", }` |
| `dateOfBirth` | `Date` | `—` |
| `userType` | `String` | `required: true; default: "ims_admin"` |
| `status` | `String (enum)` | `default: "active"; enum: ["active", "inactive", "suspended"]; index: true` |
| `isActive` | `Boolean` | `default: true` |
| `isEmailVerified` | `Boolean` | `default: false` |
| `vendorPermissions` | `Array<String>` | `default: []` |
| `defaultLandingPage` | `String (enum)` | `default: ''; enum: ['', ...IMS_LANDING_PAGES]` |
| `autoAddToPortals` | `Boolean` | `default: false` |
| `lastLoginAt` | `Date` | `—` |
| `isOnLeave` | `Boolean` | `default: false` |
| `leaveStartDate` | `Date` | `—` |
| `leaveEndDate` | `Date` | `—` |
| `leaveNotes` | `String` | `trim: true` |
| `employmentConfirmedAt` | `Date` | `—` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ userType: 1, status: 1 }`
- `{ email: 1, status: 1 }`
- `{ username: 1 }, { unique: true, partialFilterExpression: { username: { $type: "string" } }, background: true, }`
- `{ employeeId: 1 }, { unique: true, partialFilterExpression: { employeeId: { $type: "string" } }, background: true, }`

Middleware declarations: `pre("validate") in server/src/models/VendorUser.model.ts at line 205`; `pre("save") in server/src/models/VendorUser.model.ts at line 221`.

<a id="model-voucherevidenceasset"></a>
### VoucherEvidenceAsset (`voucherevidenceassets`)

Source: [server/src/models/VoucherEvidenceAsset.model.ts](server/src/models/VoucherEvidenceAsset.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `orderId` | `ObjectId` | `required: true; ref: 'Order'; immutable: true` |
| `operationId` | `String` | `required: true; immutable: true` |
| `kind` | `String (enum)` | `required: true; enum: ['fitting-signature', 'pickup-signature', 'recipient-id']; immutable: true` |
| `bucket` | `String` | `required: true; immutable: true` |
| `objectKey` | `String` | `required: true; immutable: true` |
| `region` | `String` | `required: true; immutable: true` |
| `contentType` | `String (enum)` | `required: true; enum: ['image/png', 'image/jpeg']; immutable: true` |
| `size` | `Number` | `required: true; immutable: true` |
| `checksum` | `String` | `required: true; immutable: true` |
| `capturedBy` | `String` | `required: true; immutable: true` |
| `capturedAt` | `Date` | `required: true; immutable: true` |
| `versionId` | `String` | `—` |
| `developmentDataUrl` | `String` | `select: false` |
| `state` | `String (enum)` | `required: true; default: 'pending'; enum: ['pending', 'committed', 'deleting']` |
| `committedAt` | `Date` | `—` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ bucket: 1, objectKey: 1 }, { unique: true }`
- `{ state: 1, createdAt: 1 }`

<a id="model-voucherpickuprecord"></a>
### VoucherPickupRecord (`voucherpickuprecords`)

Source: [server/src/models/VoucherPickupRecord.model.ts](server/src/models/VoucherPickupRecord.model.ts). Schema options: `{ timestamps: true }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `orderId` | `ObjectId` | `required: true; ref: 'Order'` |
| `pickupId` | `String` | `required: true` |
| `snapshot` | `Mixed` | `required: true; immutable: true` |
| `recipient` | `Mixed` | `required: true; immutable: true` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ orderId: 1, pickupId: 1 }, { unique: true }`

<a id="model-walkinallotmenthistory"></a>
### WalkInAllotmentHistory (`walkinallotmenthistories`)

Source: [server/src/models/WalkInAllotmentHistory.model.ts](server/src/models/WalkInAllotmentHistory.model.ts). Schema options: `{ timestamps: true, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `customerId` | `ObjectId` | `required: true; ref: "WalkInCustomer"` |
| `companyName` | `String` | `required: true` |
| `actionType` | `String (enum)` | `required: true; enum: ["UPDATE", "USAGE"]` |
| `amount` | `Number` | `required: true` |
| `previousBalance` | `Number` | `required: true` |
| `newBalance` | `Number` | `required: true` |
| `allotmentType` | `String (enum)` | `required: true; enum: ["unit", "money"]` |
| `orderId` | `String` | `—` |
| `items` | `Array` | `—` |
| `items[].productName` | `String` | `—` |
| `items[].qty` | `Number` | `—` |
| `items[].price` | `Number` | `—` |
| `items[].unitsUsed` | `Number` | `—` |
| `adminId` | `ObjectId` | `ref: "User"` |
| `adminName` | `String` | `—` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ customerId: 1, companyName: 1 }`
- `{ createdAt: -1 }`

<a id="model-walkincontractprice"></a>
### WalkInContractPrice (`walkincontractprices`)

Source: [server/src/models/WalkInContractPrice.model.ts](server/src/models/WalkInContractPrice.model.ts). Schema options: `{ timestamps: true, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `companyName` | `String` | `index: true; trim: true` |
| `customerId` | `ObjectId` | `ref: "WalkInCustomer"; index: true` |
| `products` | `Array` | `—` |
| `products[].productId` | `ObjectId` | `required: true; ref: "Product"` |
| `products[].variants` | `Array` | `—` |
| `products[].variants[].variantId` | `ObjectId` | `required: true; ref: "Variant"` |
| `products[].variants[].contractPrice` | `Number` | `required: true; min: 0` |
| `createdBy` | `ObjectId` | `required: true; ref: "User"` |

Declared schema indexes (field-level indexes are also listed in the constraints above):

- `{ companyName: 1 }, { unique: true, partialFilterExpression: { companyName: { $exists: true, $type: "string" } } }`
- `{ customerId: 1 }, { unique: true, partialFilterExpression: { customerId: { $exists: true } } }`

Middleware declarations: `pre("validate") in server/src/models/WalkInContractPrice.model.ts at line 65`.

<a id="model-walkincustomer"></a>
### WalkInCustomer (`walkincustomers`)

Source: [server/src/models/WalkInCustomer.model.ts](server/src/models/WalkInCustomer.model.ts). Schema options: `{ timestamps: true, }`.

| Field path | Type | Declared values and constraints |
| --- | --- | --- |
| `firstName` | `String` | `required: true` |
| `lastName` | `String` | `default: ""` |
| `email` | `String` | `default: ""` |
| `contact` | `Array` | `—` |
| `contact[]` | `{ type: String }` | `phone: { type: String }` |
| `contact[].type` | `String` | `—` |
| `source` | `String` | `default: "pos"` |
| `address` | `Object` | `—` |
| `address.street` | `String` | `default: ""` |
| `address.city` | `String` | `default: ""` |
| `address.state` | `String` | `default: ""` |
| `address.zip` | `String` | `default: ""` |
| `discountPercent` | `Number` | `default: 0; min: 0; max: 100` |
| `isTaxExempt` | `Boolean` | `default: false` |
| `taxId` | `String` | `default: ""` |
| `taxExemptNumber` | `String` | `default: ""` |
| `taxExemptCategory` | `String` | `default: "none"` |
| `isCompany` | `Boolean` | `default: false` |
| `companies` | `Array` | `—` |
| `companies[].companyName` | `String` | `required: true` |
| `companies[].allotmentType` | `String (enum)` | `required: true; enum: ["unit", "money"]` |
| `companies[].totalAllotment` | `Number` | `default: 0` |
| `companies[].usedAllotment` | `Number` | `default: 0` |
| `companies[].allotmentValue` | `Number` | `default: 0` |
| `companies[].isUnlimited` | `Boolean` | `default: false` |

Middleware declarations: `pre("save") in server/src/models/WalkInCustomer.model.ts at line 76`.

## POS NeDB datastore declarations

Source filenames below are expressions as declared in code. Most use Electron’s `userData` directory. `measurementsDB` uses `measurements.db` with a separate development path; `rolesDB` resolves to `userData/cashierRoles.db`. `cashiersDB` is instantiated in both `index.ts` and `cashiers.db.ts`, targeting the same `userData/cashiers.db` file; both declarations are shown rather than treated as different stores. Indexes combine declarations by store name across helper modules and `db/index.ts`.

| Store | Filename expression | Declared indexes | Source |
| --- | --- | --- | --- |
| `cashiersDB` | `cashiersFile` | `{ fieldName: 'serverId', unique: true, sparse: true }`<br>`{ fieldName: 'email', sparse: true }`<br>`{ fieldName: 'username', sparse: true }`<br>`{ fieldName: 'badgeCode', sparse: true }`<br>`{ fieldName: 'employeeId', sparse: true }` | [Source](pos/electron/db/cashiers.db.ts) |
| `salesDB` | `path.join(userDataPath, 'sales.db')` | `{ fieldName: 'sessionId' }`<br>`{ fieldName: 'createdAt' }`<br>`{ fieldName: 'serverOrderId', sparse: true }`<br>`{ fieldName: 'localId', sparse: true }`<br>`{ fieldName: 'isSynced' }`<br>`{ fieldName: 'status' }` | [Source](pos/electron/db/index.ts) |
| `productsDB` | `path.join(userDataPath, 'products.db')` | `{ fieldName: 'sku' }`<br>`{ fieldName: 'masterSku' }`<br>`{ fieldName: 'vendorSku' }`<br>`{ fieldName: 'barcode' }`<br>`{ fieldName: 'name' }`<br>`{ fieldName: 'productServerId' }`<br>`{ fieldName: 'serverId', unique: true, sparse: true }` | [Source](pos/electron/db/index.ts) |
| `customersDB` | `path.join(userDataPath, 'customers.db')` | None declared | [Source](pos/electron/db/index.ts) |
| `sessionDB` | `path.join(userDataPath, 'session.db')` | None declared | [Source](pos/electron/db/index.ts) |
| `syncQueueDB` | `path.join(userDataPath, 'syncQueue.db')` | None declared | [Source](pos/electron/db/index.ts) |
| `cashiersDB` | `path.join(userDataPath, 'cashiers.db')` | `{ fieldName: 'serverId', unique: true, sparse: true }`<br>`{ fieldName: 'email', sparse: true }`<br>`{ fieldName: 'username', sparse: true }`<br>`{ fieldName: 'badgeCode', sparse: true }`<br>`{ fieldName: 'employeeId', sparse: true }` | [Source](pos/electron/db/index.ts) |
| `syncHistoryDB` | `path.join(userDataPath, 'syncHistory.db')` | None declared | [Source](pos/electron/db/index.ts) |
| `reusableProductOptionsDB` | `path.join(userDataPath, 'reusable_product_options.db')` | None declared | [Source](pos/electron/db/index.ts) |
| `locationsDB` | `path.join(userDataPath, 'locations.db')` | None declared | [Source](pos/electron/db/index.ts) |
| `facilitiesDB` | `path.join(userDataPath, 'facilities.db')` | `{ fieldName: 'facilityId', unique: true, sparse: true }` | [Source](pos/electron/db/index.ts) |
| `companyContractsDB` | `path.join(userDataPath, 'company_contracts.db')` | None declared | [Source](pos/electron/db/index.ts) |
| `companyPortalsDB` | `path.join(userDataPath, 'company_portals.db')` | None declared | [Source](pos/electron/db/index.ts) |
| `companyAllotmentsDB` | `path.join(userDataPath, 'company_allotments.db')` | None declared | [Source](pos/electron/db/index.ts) |
| `companyAssignmentsDB` | `path.join(userDataPath, 'company_assignments.db')` | None declared | [Source](pos/electron/db/index.ts) |
| `companyPortalUsersDB` | `path.join(userDataPath, 'company_portal_users.db')` | None declared | [Source](pos/electron/db/index.ts) |
| `companyGroupsDB` | `path.join(userDataPath, 'company_groups.db')` | None declared | [Source](pos/electron/db/index.ts) |
| `heldCartsDB` | `path.join(userDataPath, 'held_carts.db')` | None declared | [Source](pos/electron/db/index.ts) |
| `customerOrdersDB` | `path.join(userDataPath, 'customer_orders.db')` | `{ fieldName: 'id', unique: true }` | [Source](pos/electron/db/index.ts) |
| `walkInContractsDB` | `path.join(userDataPath, 'walkin-contracts.db')` | None declared | [Source](pos/electron/db/index.ts) |
| `alterationsDB` | `path.join(userDataPath, 'alterations.db')` | None declared | [Source](pos/electron/db/index.ts) |
| `notesDB` | `path.join(userDataPath, 'notes.db')` | `{ fieldName: 'entityType' }`<br>`{ fieldName: 'entityId' }`<br>`{ fieldName: 'isWarning' }` | [Source](pos/electron/db/index.ts) |
| `measurementsDB` | `dbPath` | `{ fieldName: 'ownerId' }` | [Source](pos/electron/db/measurements.db.ts) |
| `rolesDB` | `getRolesFilePath()` | `{ fieldName: 'value', unique: true, sparse: true }` | [Source](pos/electron/db/roles.db.ts) |

Local record shapes are defined in `pos/src/types/` and the datastore helpers. NeDB has no Mongoose-style field schema; the table above does not imply that other fields are prohibited. Read the normalization code in `pos/electron/services/poll.service.ts` and `products.db.ts` before relying on server fields at the POS.
