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
