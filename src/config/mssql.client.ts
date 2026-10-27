import sql from 'mssql';
import { config } from './env.config';

const sqlConfig: sql.config = {
  user: config.sql.user,
  password: config.sql.password,
  database: config.sql.database,
  server: config.sql.host,
  port: config.sql.port,
  pool: {
    max: 10,
    min: 2,
    idleTimeoutMillis: 60000,
  },
  options: {
    encrypt: config.sql.encrypt,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  connectionTimeout: config.sql.connectionTimeout,
  requestTimeout: config.sql.requestTimeout,
};

let pool: sql.ConnectionPool | null = null;

export async function getSqlPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) return pool;
  try {
    pool = await new sql.ConnectionPool(sqlConfig).connect();
    console.log(`[SQL Client] Connected successfully to SQL Server (${config.sql.database}@${config.sql.host}:${config.sql.port})`);
    return pool;
  } catch (err) {
    console.error('[SQL Client] Error connecting to SQL Server:', err);
    throw err;
  }
}

export async function closeSqlPool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
    console.log('[SQL Client] SQL Server connection pool closed.');
  }
}
