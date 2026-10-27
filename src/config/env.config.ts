import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export const config = {
  port: Number(process.env.PORT) || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  sql: {
    host: process.env.CP_SQL_HOST || 'localhost',
    port: Number(process.env.CP_SQL_PORT) || 1433,
    user: process.env.CP_SQL_USER || 'cp_migration_reader',
    password: process.env.CP_SQL_PASSWORD || 'StrongMigrationPass!2026',
    database: process.env.CP_SQL_DATABASE || 'CounterPoint_Staging',
    encrypt: process.env.CP_SQL_ENCRYPT === 'true',
    requestTimeout: 300000, // 5 minutes for heavy keyset queries
    connectionTimeout: 30000,
  },
  mongo: {
    uri: process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/ims_staging_migration',
  },
  batchSize: Number(process.env.BATCH_SIZE) || 1000,
  keysetBatchSize: Number(process.env.KEYSET_BATCH_SIZE) || 1000,
};
