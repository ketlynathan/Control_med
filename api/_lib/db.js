const { Pool } = require('pg');

let pool;

/**
 * Reuses a single connection pool across invocations (important on
 * serverless: creating a new pool per request exhausts DB connections).
 */
function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL não está configurada nas variáveis de ambiente da Vercel.');
    }
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      // Managed Postgres providers (Neon, Supabase, Vercel Postgres, Railway)
      // require SSL. Set PGSSL=disable in env only for local Postgres without SSL.
      ssl: process.env.PGSSL === 'disable' ? false : { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 10000,
    });
  }
  return pool;
}

module.exports = { getPool };
