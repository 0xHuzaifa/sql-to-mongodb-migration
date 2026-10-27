# Part 07: Error Handling, Mongoose Hook Safety & Dead-Letter Logging

## 1. Respecting Mongoose Validation & Hooks During Bulk Loads
A common mistake in MongoDB migrations is using raw `collection.insertMany()` and bypassing Mongoose schemas entirely—which silently inserts invalid enum values, missing required fields, or uncalculated inventory fields (`qtyAvailable`).

On the other hand, calling `doc.save()` one-by-one is too slow for 50GB of data.

### The Best-of-Both-Worlds Pattern: In-Memory `new Model(data)` + `validateSync()` before `bulkWrite()`
For every row in a 1,000-row batch:
1. Instantiate the Mongoose document in memory: `const doc = new Inventory(transformedData);`
2. For `Inventory`, trigger its `pre("validate")` calculation logic (`doc.qtyAvailable = Math.max(0, doc.qtyOnHand - doc.qtyReserved - doc.qtyAllocated)`) and run `await doc.validate()`.
3. If `doc.validate()` succeeds, push `doc.toObject()` into the `bulkWrite` array.
4. If `doc.validate()` throws a `ValidationError`, catch that specific record without failing the rest of the 999 records in the batch, and log it to **`CounterPointMigration`**.

---

## 2. Complete Batch Loader with Dead-Letter Isolation (`bulkLoader.service.ts`)

This service plugs directly into your existing `server/src/models/CounterPointMigration.model.ts`:

```typescript
// server/src/migration/loaders/bulkLoader.service.ts
import mongoose, { Model, Document } from 'mongoose';
import { CounterPointMigration } from '../../models/CounterPointMigration.model';

export interface BatchItemInput<T> {
  identifier: string;             // e.g., ITEM_NO or CUST_NO or DOC_ID
  filter: Record<string, any>;    // Idempotent upsert filter, e.g., { masterSku: 'SHIRT-01' }
  payload: Partial<T>;            // Transformed Mongoose fields
  warnings?: string[];            // Any non-fatal warnings (e.g., negative stock clamped)
  safeSummaryData?: Record<string, any>; // PCI-safe raw snippet (NEVER include card data!)
}

export async function validateAndBulkUpsert<T extends Document>(
  model: Model<T>,
  moduleName: 'barcodes' | 'customers' | 'company_customers' | 'sales_history' | 'invoices' | 'reports' | 'other_data',
  batchId: string,
  items: BatchItemInput<T>[]
): Promise<{ success: number; warnings: number; failed: number }> {
  const bulkOps: any[] = [];
  const auditRecords: any[] = [];
  let success = 0;
  let warnings = 0;
  let failed = 0;

  for (const item of items) {
    try {
      // 1. Instantiate Mongoose document to apply defaults, setters, and pre-validate rules
      const doc = new model(item.payload);
      await doc.validate();

      const plainObj = doc.toObject();
      delete plainObj._id; // Prevent _id immutable conflict on upsert if doc already exists

      bulkOps.push({
        updateOne: {
          filter: item.filter,
          update: {
            $set: plainObj,
            $setOnInsert: { _id: doc._id },
          },
          upsert: true,
        },
      });

      if (item.warnings && item.warnings.length > 0) {
        warnings++;
        auditRecords.push({
          identifier: item.identifier,
          status: 'warning',
          message: item.warnings.join('; '),
          rawData: item.safeSummaryData || null,
          importedAt: new Date(),
        });
      } else {
        success++;
      }
    } catch (validationErr: any) {
      failed++;
      auditRecords.push({
        identifier: item.identifier,
        status: 'error',
        message: `Validation Failed: ${validationErr.message}`,
        rawData: item.safeSummaryData || null,
        importedAt: new Date(),
      });
    }
  }

  // 2. Execute BulkWrite with ordered: false so a duplicate-key edge case doesn't halt the batch
  if (bulkOps.length > 0) {
    try {
      await model.bulkWrite(bulkOps, { ordered: false });
    } catch (bulkWriteErr: any) {
      // Isolate individual write errors from BulkWriteError
      const writeErrors = bulkWriteErr.writeErrors || [];
      for (const we of writeErrors) {
        failed++;
        success = Math.max(0, success - 1);
        const failedItem = items[we.index];
        auditRecords.push({
          identifier: failedItem?.identifier || `index_${we.index}`,
          status: 'error',
          message: `Mongo BulkWrite Error (Code ${we.code}): ${we.errmsg}`,
          rawData: failedItem?.safeSummaryData || null,
          importedAt: new Date(),
        });
      }
    }
  }

  // 3. Persist warnings & errors into CounterPointMigration (capped per batch so document < 16MB)
  await CounterPointMigration.findOneAndUpdate(
    { batchId },
    {
      $setOnInsert: {
        module: moduleName,
        fileName: 'SQL_SERVER_DIRECT_STREAM',
        executedBy: 'MigrationEngine',
      },
      $inc: {
        totalRecords: items.length,
        successfulRecords: success,
        warningRecords: warnings,
        failedRecords: failed,
      },
      ...(auditRecords.length > 0
        ? {
            $push: {
              records: {
                $each: auditRecords.slice(0, 500), // Prevent 16MB BSON limit overflow
              },
            },
          }
        : {}),
    },
    { upsert: true }
  );

  return { success, warnings, failed };
}
```

---

## 3. Specific Edge-Case Policies Enforced by the Loader

| Edge Case in SQL Server | Policy Enforced in Transformer + Loader |
| :--- | :--- |
| **`IM_ITEM.DESCR` < 3 chars** | Append `(${ITEM_NO})` to satisfy `Product.name` `minLength: 3` and log a `warning`. |
| **`IM_INV_CELL.QTY_ON_HND <= 0`** | Do not create `InventoryLocation` (which enforces `min: 1`). Set `Inventory.qtyOnHand = Math.max(0, sum)` and log original negative/zero location stock in `CounterPointMigration` as a `warning`. |
| **Duplicate Barcode in `IM_BARCOD`** | Keep primary barcode on the first matching variant; log duplicate barcode collision as a `warning` in `CounterPointMigration` for label verification. |
| **Anomalous Grid Tag (`BLACK`, `Select one`)** | Store under `Variant.additionalAttributes` via `resolveDimensionTag()` and log a `warning` with `ITEM_NO` for catalog cleanup. |