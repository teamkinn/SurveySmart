const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

const jwt = require('jsonwebtoken');
const db = require('../src/config/db');
const auth = require('../src/middleware/auth');
const isAdmin = require('../src/middleware/isAdmin');
const isHeadAdmin = require('../src/middleware/isHeadAdmin');
const { mockRes } = require('./helpers/mockReqRes');

test.after(async () => {
  try { await db.end(); } catch { /* nothing was ever connected */ }
});

test('auth middleware — rejects a request with no Authorization header', async () => {
  const req = { headers: {} };
  const res = mockRes();
  let nextCalled = false;
  await auth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('auth middleware — rejects a malformed/invalid token', async () => {
  const req = { headers: { authorization: 'Bearer this-is-not-a-jwt' } };
  const res = mockRes();
  let nextCalled = false;
  await auth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('auth middleware — accepts a valid token for an active user and attaches fresh req.user from the DB', async () => {
  const token = jwt.sign({ id: 1, username: 'tester', role: 'user' }, process.env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = mockRes();
  let nextCalled = false;

  const originalQuery = db.query;
  db.query = async () => [[{ id: 1, username: 'tester', email: 't@example.com', role: 'user', is_active: 1 }]];
  await auth(req, res, () => { nextCalled = true; });
  db.query = originalQuery;

  assert.equal(nextCalled, true);
  assert.equal(req.user.id, 1);
  assert.equal(req.user.role, 'user');
});

test('auth middleware — rejects a valid token whose account has since been suspended (is_active=0) — revocation regression test', async () => {
  const token = jwt.sign({ id: 1, username: 'tester', role: 'user' }, process.env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = mockRes();
  let nextCalled = false;

  const originalQuery = db.query;
  db.query = async () => [[{ id: 1, username: 'tester', email: 't@example.com', role: 'user', is_active: 0 }]];
  await auth(req, res, () => { nextCalled = true; });
  db.query = originalQuery;

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('auth middleware — a stale token whose role was demoted server-side gets the fresh (lower) role, not the one baked into the token — revocation regression test', async () => {
  const token = jwt.sign({ id: 1, username: 'tester', role: 'admin' }, process.env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = mockRes();
  let nextCalled = false;

  const originalQuery = db.query;
  // Token still says "admin", but the DB now says the account was demoted.
  db.query = async () => [[{ id: 1, username: 'tester', email: 't@example.com', role: 'user', is_active: 1 }]];
  await auth(req, res, () => { nextCalled = true; });
  db.query = originalQuery;

  assert.equal(nextCalled, true);
  assert.equal(req.user.role, 'user');
});

test('auth middleware — rejects a token for a user that no longer exists (deleted account)', async () => {
  const token = jwt.sign({ id: 999, username: 'ghost', role: 'user' }, process.env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = mockRes();
  let nextCalled = false;

  const originalQuery = db.query;
  db.query = async () => [[]];
  await auth(req, res, () => { nextCalled = true; });
  db.query = originalQuery;

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('isAdmin — allows admin and head_admin roles through', () => {
  for (const role of ['admin', 'head_admin']) {
    const req = { user: { role } };
    const res = mockRes();
    let nextCalled = false;
    isAdmin(req, res, () => { nextCalled = true; });
    assert.equal(nextCalled, true, `role "${role}" should be allowed through`);
  }
});

test('isAdmin — rejects a plain user role with 403', () => {
  const req = { user: { role: 'user' } };
  const res = mockRes();
  let nextCalled = false;
  isAdmin(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('isHeadAdmin — rejects a plain admin (only head_admin may pass)', () => {
  const req = { user: { role: 'admin' } };
  const res = mockRes();
  let nextCalled = false;
  isHeadAdmin(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
});

test('isHeadAdmin — allows head_admin through', () => {
  const req = { user: { role: 'head_admin' } };
  const res = mockRes();
  let nextCalled = false;
  isHeadAdmin(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
});
