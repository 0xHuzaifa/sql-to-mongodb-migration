import mongoose, { Model } from 'mongoose';
import pLimit from 'p-limit';
import { CounterPointMigration } from '../models/ims/CounterPointMigration.model';

export interface BatchItemInput<T = any> {
  identifier: string;                   // e.g., ITEM_NO or CUST_NO or DOC_ID
  filter: Record<string, any>;          // Idempotent upsert filter, e.g., { masterSku: 'SHIRT-01' }
  payload: Partial<T>;                  // Transformed Mongoose fields
  warnings?: string[];                  // Any non-fatal warnings (e.g., negative stock clamped)
  safeSummaryData?: Record<string, any>;// Safe raw snippet (NEVER card data!)
}

export interface BulkLoaderResult {
  success: number;
  warnings: number;
  failed: number;
}

export async function validateAndBulkUpsert<T = any>(
  model: Model<any>,
  moduleName:
    | 'barcodes'
    | 'customers'
    | 'company_customers'
    | 'sales_history'
    | 'invoices'
    | 'reports'
    | 'other_data',
  batchId: string,
  items: BatchItemInput<T>[]
): Promise<BulkLoaderResult> {
  if (!items || items.length === 0) {
    return { success: 0, warnings: 0, failed: 0 };
  }

  const bulkOps: any[] = [];
  const auditRecords: any[] = [];
  let success = 0;
  let warnings = 0;
  let failed = 0;

  for (const item of items) {
    try {
      // 1. Instantiate Mongoose document to apply schema defaults, casting, and pre-validate hooks
      const doc = new model(item.payload);
      const validationErr = doc.validateSync();

      if (validationErr) {
        failed++;
        auditRecords.push({
          identifier: item.identifier,
          status: 'error',
          message: `Validation Failed: ${validationErr.message}`,
          rawData: item.safeSummaryData || null,
          importedAt: new Date(),
        });
        continue;
      }

      const plainObj = doc.toObject();
      delete plainObj._id; // Prevent _id immutable conflict on upsert if document exists

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

  // 2. Execute BulkWrite in 1,000-op chunks concurrently using p-limit
  if (bulkOps.length > 0) {
    const CHUNK_SIZE = 1000;
    const chunks: any[][] = [];
    for (let i = 0; i < bulkOps.length; i += CHUNK_SIZE) {
      chunks.push(bulkOps.slice(i, i + CHUNK_SIZE));
    }

    const limit = pLimit(4); // Capped concurrency to prevent MongoDB pool starvation
    await Promise.all(
      chunks.map((chunk, chunkIdx) =>
        limit(async () => {
          try {
            await model.bulkWrite(chunk, { ordered: false });
          } catch (bulkWriteErr: any) {
            const writeErrors = bulkWriteErr.writeErrors || [];
            for (const we of writeErrors) {
              failed++;
              success = Math.max(0, success - 1);
              const originalIndex = chunkIdx * CHUNK_SIZE + we.index;
              const failedItem = items[originalIndex];
              auditRecords.push({
                identifier: failedItem?.identifier || `index_${originalIndex}`,
                status: 'error',
                message: `Mongo BulkWrite Error (Code ${we.code}): ${we.errmsg}`,
                rawData: failedItem?.safeSummaryData || null,
                importedAt: new Date(),
              });
            }
          }
        })
      )
    );
  }

  // 3. Persist audit logs into CounterPointMigration (capped to avoid 16MB document limit)
  try {
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
                  $each: auditRecords.slice(0, 500), // Max 500 records per batch log
                },
              },
            }
          : {}),
      },
      { upsert: true }
    );
  } catch (auditErr) {
    console.warn(`[BulkLoader] Failed to update CounterPointMigration audit log:`, auditErr);
  }

  return { success, warnings, failed };
}
