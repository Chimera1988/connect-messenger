const { Pool } = require('pg');
let pool;
function getPool() {
  const connectionString = process.env.CONNECT_NEON_READ_DATABASE_URL;
  if (!connectionString || !/^postgres(?:ql)?:\/\//.test(connectionString)) throw new Error('Neon database is not configured');
  if (process.env.CONNECT_NEON_READ_ONLY !== '1') throw new Error('Read-only flag is required');
  if (!pool) pool = new Pool({ connectionString, max: 3, connectionTimeoutMillis: 8000, idleTimeoutMillis: 10000 });
  return pool;
}
module.exports = { getPool };
