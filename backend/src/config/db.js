const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'surveysmart',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  // TCP keepalive on pooled sockets + close connections that sat idle for
  // 30s, so the pool holds fewer long-idle sockets that the network or MySQL
  // may have silently dropped.
  enableKeepAlive: true,
  keepAliveInitialDelay: 10000,
  idleTimeout: 30000,
});

// Why the extra handling below: on Railway (especially with App Sleeping /
// Serverless on) the container is frozen while idle, and the pooled MySQL
// sockets are dead by the time it wakes. mysql2 doesn't validate a pooled
// connection before handing it out, so the FIRST request after a quiet
// period failed with a 500 (then every retry worked) — observed on the live
// site: /api/surveys/public/:token and /api/auth/verify-reset-code both
// returned 500 once, then 404/400 correctly right after.
const STALE_CONNECTION_CODES = new Set([
  'PROTOCOL_CONNECTION_LOST', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT',
  'ER_CON_COUNT_ERROR',
]);
function isStaleConnectionError(err) {
  if (!err) return false;
  if (STALE_CONNECTION_CODES.has(err.code)) return true;
  // mysql2's message when a pooled connection was already closed underneath it
  return /closed state|Connection lost/i.test(err.message || '');
}

// Only read-only statements are retried: a write whose connection died
// mid-flight might already have been applied, and re-running it could
// duplicate data. Reads are always safe to repeat.
function isReadOnly(sql) {
  const text = typeof sql === 'string' ? sql : sql?.sql;
  return /^\s*(SELECT|SHOW)\b/i.test(text || '');
}

const rawQuery = pool.query.bind(pool);
pool.query = async function query(sql, values) {
  try {
    return await rawQuery(sql, values);
  } catch (err) {
    if (!isStaleConnectionError(err) || !isReadOnly(sql)) throw err;
    console.warn(`[db] stale connection (${err.code || err.message}) — retrying read once`);
    return rawQuery(sql, values);
  }
};

// Transactions (response submit, CSV import, survey question replace) take a
// dedicated connection — ping it first and swap a dead one for a fresh one,
// so a stale socket fails here harmlessly instead of mid-transaction.
const rawGetConnection = pool.getConnection.bind(pool);
pool.getConnection = async function getConnection() {
  const conn = await rawGetConnection();
  try {
    await conn.ping();
    return conn;
  } catch (err) {
    conn.destroy();
    if (!isStaleConnectionError(err)) throw err;
    console.warn(`[db] stale pooled connection (${err.code || err.message}) — replaced`);
    return rawGetConnection();
  }
};

pool._internals = { isStaleConnectionError, isReadOnly };
module.exports = pool;
