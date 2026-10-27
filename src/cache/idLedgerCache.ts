import mongoose from 'mongoose';
import { MigrationKeyLedger } from '../models/MigrationKeyLedger.model';

interface CacheEntry {
  objectId: mongoose.Types.ObjectId;
  businessKey?: string;
  isNew?: boolean;
}

class IdLedgerCache {
  private cache = new Map<string, CacheEntry>();

  private makeKey(domain: string, sqlKey: string): string {
    return `${domain}::${sqlKey}`;
  }

  /**
   * Warm up cache from MongoDB MigrationKeyLedger for given domains
   */
  async warmUpDomains(domains?: string[]): Promise<number> {
    const filter = domains && domains.length > 0 ? { domain: { $in: domains } } : {};
    console.log(`[IdLedgerCache] Warming up cache for domains: ${domains ? domains.join(', ') : 'ALL'}...`);

    const cursor = MigrationKeyLedger.find(filter).lean().cursor();
    let loadedCount = 0;

    for await (const doc of cursor) {
      this.cache.set(this.makeKey(doc.domain, doc.sqlKey), {
        objectId: doc.targetObjectId as mongoose.Types.ObjectId,
        businessKey: doc.targetBusinessKey,
        isNew: false,
      });
      loadedCount++;
    }

    console.log(`[IdLedgerCache] Cache warm-up complete. Loaded ${loadedCount} keys into RAM (Total cache size: ${this.cache.size}).`);
    return loadedCount;
  }

  getObjectId(domain: string, sqlKey: string): mongoose.Types.ObjectId | undefined {
    return this.cache.get(this.makeKey(domain, sqlKey))?.objectId;
  }

  getBusinessKey(domain: string, sqlKey: string): string | undefined {
    return this.cache.get(this.makeKey(domain, sqlKey))?.businessKey;
  }

  has(domain: string, sqlKey: string): boolean {
    return this.cache.has(this.makeKey(domain, sqlKey));
  }

  /**
   * Returns existing ObjectId or generates a deterministic new one and records it in RAM
   */
  getOrCreateObjectId(
    domain: string,
    sqlKey: string,
    targetBusinessKey?: string
  ): { objectId: mongoose.Types.ObjectId; isNew: boolean } {
    const composite = this.makeKey(domain, sqlKey);
    const existing = this.cache.get(composite);
    if (existing) {
      return { objectId: existing.objectId, isNew: false };
    }

    const newId = new mongoose.Types.ObjectId();
    this.cache.set(composite, {
      objectId: newId,
      businessKey: targetBusinessKey,
      isNew: true,
    });
    return { objectId: newId, isNew: true };
  }

  /**
   * Registers a known mapping into cache
   */
  set(domain: string, sqlKey: string, objectId: mongoose.Types.ObjectId, businessKey?: string): void {
    this.cache.set(this.makeKey(domain, sqlKey), { objectId, businessKey, isNew: false });
  }

  /**
   * Flushes new in-memory ledger entries to MongoDB in bulk
   */
  async flushNewEntriesToMongo(batchId: string, targetModel: string): Promise<number> {
    const bulkOps: any[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (entry.isNew) {
        const [domain, ...sqlKeyParts] = key.split('::');
        const sqlKey = sqlKeyParts.join('::');

        bulkOps.push({
          updateOne: {
            filter: { domain, sqlKey },
            update: {
              $setOnInsert: {
                domain,
                sqlKey,
                targetModel,
                targetObjectId: entry.objectId,
                targetBusinessKey: entry.businessKey || null,
                batchId,
                createdAt: new Date(),
              },
            },
            upsert: true,
          },
        });
        entry.isNew = false; // Mark flushed
      }
    }

    if (bulkOps.length > 0) {
      const res = await MigrationKeyLedger.bulkWrite(bulkOps, { ordered: false });
      return res.upsertedCount + res.modifiedCount;
    }
    return 0;
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  clear(): void {
    this.cache.clear();
  }
}

export const ledgerCache = new IdLedgerCache();
export default ledgerCache;
