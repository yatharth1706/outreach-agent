import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Reuse one pool across hot reloads in dev and across requests on a warm instance.
const globalForDb = globalThis as unknown as { pgPool?: Pool };

const pool =
  globalForDb.pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
globalForDb.pgPool = pool;

export const db = drizzle(pool, { schema });
export { schema };
