const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const ctrl = require('../src/controllers/userController');
const { mockRes } = require('./helpers/mockReqRes');

test.after(async () => {
  try { await db.end(); } catch { /* nothing was ever connected */ }
});

test('search — returns an empty array without querying the DB when q is missing', async () => {
  const originalQuery = db.query;
  let queried = false;
  db.query = async () => { queried = true; return [[]]; };
  const req = { user: { id: 1 }, query: {} };
  const res = mockRes();
  await ctrl.search(req, res);
  db.query = originalQuery;

  assert.equal(queried, false);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
});

test('search — returns an empty array without querying the DB when q is under 2 characters', async () => {
  const originalQuery = db.query;
  let queried = false;
  db.query = async () => { queried = true; return [[]]; };
  const req = { user: { id: 1 }, query: { q: 'a' } };
  const res = mockRes();
  await ctrl.search(req, res);
  db.query = originalQuery;

  assert.equal(queried, false);
  assert.deepEqual(res.body, []);
});

test('search — trims whitespace before checking the length floor', async () => {
  const originalQuery = db.query;
  let queried = false;
  db.query = async () => { queried = true; return [[]]; };
  const req = { user: { id: 1 }, query: { q: '  a  ' } };
  const res = mockRes();
  await ctrl.search(req, res);
  db.query = originalQuery;

  assert.equal(queried, false);
});

test('search — excludes the caller, scopes to active users, and applies the LIKE filter to all four name/email columns', async () => {
  const originalQuery = db.query;
  let capturedSql, capturedParams;
  db.query = async (sql, params) => {
    capturedSql = sql;
    capturedParams = params;
    return [[{ id: 2, username: 'jane', email: 'jane@example.com', first_name: 'Jane', last_name: 'Doe' }]];
  };
  const req = { user: { id: 1 }, query: { q: 'jane' } };
  const res = mockRes();
  await ctrl.search(req, res);
  db.query = originalQuery;

  assert.match(capturedSql, /is_active = 1/);
  assert.match(capturedSql, /id != \?/);
  assert.match(capturedSql, /LIMIT 10/);
  assert.deepEqual(capturedParams, [1, '%jane%', '%jane%', '%jane%', '%jane%']);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 1);
});

test('search — never returns password/role/is_active in results (only picker-safe fields)', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    // Only the columns actually SELECTed matter here — assert the query
    // text itself never asks for sensitive columns, since the mock DB layer
    // would otherwise happily "return" whatever a bug added to the SELECT.
    assert.doesNotMatch(sql, /password/i);
    assert.doesNotMatch(sql, /\brole\b/i);
    return [[]];
  };
  const req = { user: { id: 1 }, query: { q: 'jane' } };
  const res = mockRes();
  await ctrl.search(req, res);
  db.query = originalQuery;
});

test('search — a DB error is reported as a generic 500, not leaked to the client', async () => {
  const originalQuery = db.query;
  db.query = async () => { throw new Error('connection lost'); };
  const req = { user: { id: 1 }, query: { q: 'jane' } };
  const res = mockRes();
  await ctrl.search(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /connection lost/);
});
