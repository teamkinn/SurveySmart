const test = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-do-not-use-in-prod';

const bcrypt = require('bcryptjs');
const db = require('../src/config/db');
const ctrl = require('../src/controllers/authController');
const { mockRes } = require('./helpers/mockReqRes');

// See responseController.test.js — closes the mysql2 pool so the process
// can exit cleanly instead of hanging on a background connection timer.
test.after(async () => {
  try { await db.end(); } catch { /* nothing was ever connected */ }
});

test('register — rejects a request missing required fields', async () => {
  const req = { body: { username: 'onlyusername' } };
  const res = mockRes();
  await ctrl.register(req, res);
  assert.equal(res.statusCode, 400);
});

test('register — rejects a password shorter than 8 characters', async () => {
  const req = { body: { username: 'user1', email: 'a@b.com', password: 'short1' } };
  const res = mockRes();
  await ctrl.register(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /8 ตัวอักษร/);
});

test('register — rejects a username over 50 characters', async () => {
  const req = { body: { username: 'x'.repeat(51), email: 'a@b.com', password: 'goodpassword123' } };
  const res = mockRes();
  await ctrl.register(req, res);
  assert.equal(res.statusCode, 400);
});

test('login — unknown identifier and a wrong password for a real account return the identical generic message (no user enumeration)', async () => {
  const originalQuery = db.query;

  db.query = async () => [[]]; // no matching account at all
  const resUnknown = mockRes();
  await ctrl.login({ body: { identifier: 'nobody-by-this-name', password: 'whatever123' } }, resUnknown);

  const realHash = bcrypt.hashSync('the-real-password', 4);
  db.query = async () => [[{
    id: 1, username: 'realuser', email: 'real@x.com', password: realHash, is_active: 1, role: 'user',
  }]];
  const resWrongPw = mockRes();
  await ctrl.login({ body: { identifier: 'realuser', password: 'totally-wrong-password' } }, resWrongPw);

  db.query = originalQuery;

  assert.equal(resUnknown.statusCode, 401);
  assert.equal(resWrongPw.statusCode, 401);
  assert.equal(resUnknown.body.message, resWrongPw.body.message);
});

test('login — a correct password on a suspended (is_active=0) account is rejected with 403', async () => {
  const originalQuery = db.query;
  const hash = bcrypt.hashSync('correct-password', 4);
  db.query = async () => [[{
    id: 5, username: 'suspended', email: 's@x.com', password: hash, is_active: 0, role: 'user',
  }]];

  const req = { body: { identifier: 'suspended', password: 'correct-password' } };
  const res = mockRes();
  await ctrl.login(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 403);
});

test('register — a duplicate username/email that races past the pre-check returns 409, not a generic 500 (TOCTOU regression test)', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('SELECT id FROM users')) return [[]]; // pre-check sees no conflict
    if (sql.includes('INSERT INTO users')) {
      // ...but another concurrent registration won the race and inserted
      // the same username/email first, so this INSERT hits the real
      // unique-key constraint.
      const err = new Error('Duplicate entry');
      err.code = 'ER_DUP_ENTRY';
      throw err;
    }
    return [[]];
  };

  const req = { body: { username: 'racer', email: 'racer@x.com', password: 'goodpassword123' } };
  const res = mockRes();
  await ctrl.register(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 409);
});

test('resetPassword — invalidates every other outstanding code for the same user, not just this one (regression test)', async () => {
  const originalQuery = db.query;
  const calls = [];
  db.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('SELECT id FROM users')) return [[{ id: 42 }]];
    if (sql.includes('SELECT * FROM password_resets')) {
      return [[{ id: 1, user_id: 42, token: '123456' }]];
    }
    return [[]];
  };

  const req = { body: { email: 'real@x.com', code: '123456', password: 'newgoodpassword123' } };
  const res = mockRes();
  await ctrl.resetPassword(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 200);
  const invalidateOthers = calls.find(
    c => c.sql.includes('UPDATE password_resets') && c.sql.includes('used = 0')
  );
  assert.ok(invalidateOthers, 'must invalidate other unused codes for this user_id');
  assert.deepEqual(invalidateOthers.params, [42]);
});

test('resetPassword — also stamps password_changed_at, so old JWTs get revoked by the auth middleware (regression test)', async () => {
  const originalQuery = db.query;
  const calls = [];
  db.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('SELECT id FROM users')) return [[{ id: 42 }]];
    if (sql.includes('SELECT * FROM password_resets')) {
      return [[{ id: 1, user_id: 42, token: '123456' }]];
    }
    return [[]];
  };

  const req = { body: { email: 'real@x.com', code: '123456', password: 'newgoodpassword123' } };
  const res = mockRes();
  await ctrl.resetPassword(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 200);
  const passwordUpdate = calls.find(
    c => c.sql.includes('UPDATE users SET password')
  );
  assert.ok(passwordUpdate, 'must update the password');
  assert.match(passwordUpdate.sql, /password_changed_at\s*=\s*NOW\(\)/);
  assert.equal(passwordUpdate.params.length, 2);
  assert.equal(passwordUpdate.params[1], 42, 'must scope the update to the resetting user');
});

test('resetPassword — an unknown email gets the same generic "invalid code" message as a wrong code (no enumeration)', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('SELECT id FROM users')) return [[]]; // no such user
    return [[]];
  };

  const req = { body: { email: 'nobody@x.com', code: '000000', password: 'newgoodpassword123' } };
  const res = mockRes();
  await ctrl.resetPassword(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /ไม่ถูกต้องหรือหมดอายุ/);
});

test('verifyResetCode — a live, unused code for the right email is accepted without consuming it', async () => {
  const originalQuery = db.query;
  const calls = [];
  db.query = async (sql, params) => {
    calls.push({ sql, params });
    if (sql.includes('SELECT id FROM users')) return [[{ id: 42 }]];
    if (sql.includes('SELECT * FROM password_resets')) {
      return [[{ id: 1, user_id: 42, token: '123456' }]];
    }
    return [[]];
  };

  const req = { body: { email: 'real@x.com', code: '123456' } };
  const res = mockRes();
  await ctrl.verifyResetCode(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.valid, true);
  const anyUpdate = calls.find(c => c.sql.trim().toUpperCase().startsWith('UPDATE'));
  assert.equal(anyUpdate, undefined, 'must not mark the code used — only /reset-password consumes it');
});

test('verifyResetCode — a wrong code for a real email is rejected with the generic message', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('SELECT id FROM users')) return [[{ id: 42 }]];
    if (sql.includes('SELECT * FROM password_resets')) return [[]]; // no match for this code
    return [[]];
  };

  const req = { body: { email: 'real@x.com', code: '000000' } };
  const res = mockRes();
  await ctrl.verifyResetCode(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 400);
  assert.match(res.body.message, /ไม่ถูกต้องหรือหมดอายุ/);
});

test('login — a correct password on an active account succeeds and never returns the password hash', async () => {
  const originalQuery = db.query;
  const hash = bcrypt.hashSync('correct-password', 4);
  db.query = async () => [[{
    id: 6, username: 'gooduser', email: 'g@x.com', password: hash, is_active: 1, role: 'user',
  }]];

  const req = { body: { identifier: 'gooduser', password: 'correct-password' } };
  const res = mockRes();
  await ctrl.login(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 200);
  assert.ok(res.body.token);
  assert.equal(res.body.user.password, undefined);
});
