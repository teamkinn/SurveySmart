const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

const jwt = require('jsonwebtoken');
const auth = require('../src/middleware/auth');
const isAdmin = require('../src/middleware/isAdmin');
const isHeadAdmin = require('../src/middleware/isHeadAdmin');
const { mockRes } = require('./helpers/mockReqRes');

test('auth middleware — rejects a request with no Authorization header', () => {
  const req = { headers: {} };
  const res = mockRes();
  let nextCalled = false;
  auth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('auth middleware — rejects a malformed/invalid token', () => {
  const req = { headers: { authorization: 'Bearer this-is-not-a-jwt' } };
  const res = mockRes();
  let nextCalled = false;
  auth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('auth middleware — accepts a valid token and attaches req.user', () => {
  const token = jwt.sign({ id: 1, username: 'tester', role: 'user' }, process.env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = mockRes();
  let nextCalled = false;
  auth(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true);
  assert.equal(req.user.id, 1);
  assert.equal(req.user.role, 'user');
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
