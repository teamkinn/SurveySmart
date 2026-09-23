const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const ctrl = require('../src/controllers/adminController');
const { mockRes } = require('./helpers/mockReqRes');

test.after(async () => {
  try { await db.end(); } catch { /* nothing was ever connected */ }
});

test('listUsers — returns every user ordered by created_at DESC', async () => {
  const originalQuery = db.query;
  let capturedSql;
  db.query = async (sql) => {
    capturedSql = sql;
    return [[{ id: 1, username: 'a' }, { id: 2, username: 'b' }]];
  };
  const req = {};
  const res = mockRes();
  await ctrl.listUsers(req, res);
  db.query = originalQuery;

  assert.match(capturedSql, /ORDER BY created_at DESC/);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.length, 2);
});

test('listSurveys — joins every survey (any owner) with the owner\'s user info', async () => {
  const originalQuery = db.query;
  let capturedSql;
  db.query = async (sql) => {
    capturedSql = sql;
    return [[{ id: 10, title: 'x', owner_username: 'jane' }]];
  };
  const req = {};
  const res = mockRes();
  await ctrl.listSurveys(req, res);
  db.query = originalQuery;

  assert.match(capturedSql, /FROM v_survey_summary vs/);
  assert.match(capturedSql, /JOIN users u ON u\.id = vs\.user_id/);
  assert.equal(res.statusCode, 200);
});

test('setRole — rejects a role outside user/admin (e.g. cannot self-promote to head_admin via this endpoint)', async () => {
  const req = { user: { id: 1, role: 'admin' }, params: { id: '2' }, body: { role: 'head_admin' } };
  const res = mockRes();
  await ctrl.setRole(req, res);
  assert.equal(res.statusCode, 400);
});

test('setRole — rejects changing your own role', async () => {
  const req = { user: { id: 5, role: 'head_admin' }, params: { id: '5' }, body: { role: 'admin' } };
  const res = mockRes();
  await ctrl.setRole(req, res);
  assert.equal(res.statusCode, 400);
});

test('setRole — updates another user\'s role to a valid value', async () => {
  const originalQuery = db.query;
  let params;
  let call = 0;
  db.query = async (sql, p) => {
    call++;
    // 1st call: isHeadAdminAccount's own lookup of the target's current role.
    if (call === 1) return [[{ role: 'user' }]];
    params = p;
    return [{}];
  };
  const req = { user: { id: 5, role: 'head_admin' }, params: { id: '2' }, body: { role: 'admin' } };
  const res = mockRes();
  await ctrl.setRole(req, res);
  db.query = originalQuery;

  assert.deepEqual(params, ['admin', '2']);
  assert.equal(res.statusCode, 200);
});

test('setRole — refuses to change another head_admin\'s role', async () => {
  const originalQuery = db.query;
  db.query = async () => [[{ role: 'head_admin' }]];
  const req = { user: { id: 5, role: 'head_admin' }, params: { id: '2' }, body: { role: 'admin' } };
  const res = mockRes();
  await ctrl.setRole(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 403);
});

test('setStatus — rejects a non-boolean is_active value', async () => {
  const req = { user: { id: 1, role: 'head_admin' }, params: { id: '2' }, body: { is_active: 'yes' } };
  const res = mockRes();
  await ctrl.setStatus(req, res);
  assert.equal(res.statusCode, 400);
});

test('setStatus — rejects suspending your own account', async () => {
  const req = { user: { id: 5, role: 'head_admin' }, params: { id: '5' }, body: { is_active: false } };
  const res = mockRes();
  await ctrl.setStatus(req, res);
  assert.equal(res.statusCode, 400);
});

test('setStatus — suspends another user\'s account (is_active: false -> 0)', async () => {
  const originalQuery = db.query;
  let params;
  let call = 0;
  db.query = async (sql, p) => {
    call++;
    if (call === 1) return [[{ role: 'user' }]];
    params = p;
    return [{}];
  };
  const req = { user: { id: 5, role: 'head_admin' }, params: { id: '2' }, body: { is_active: false } };
  const res = mockRes();
  await ctrl.setStatus(req, res);
  db.query = originalQuery;

  assert.deepEqual(params, [0, '2']);
  assert.equal(res.body.is_active, 0);
});

test('setStatus — refuses to suspend another head_admin\'s account', async () => {
  const originalQuery = db.query;
  db.query = async () => [[{ role: 'head_admin' }]];
  const req = { user: { id: 5, role: 'head_admin' }, params: { id: '2' }, body: { is_active: false } };
  const res = mockRes();
  await ctrl.setStatus(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 403);
});

test('setStatus — re-activates another user\'s account (is_active: true -> 1)', async () => {
  const originalQuery = db.query;
  let params;
  let call = 0;
  db.query = async (sql, p) => {
    call++;
    if (call === 1) return [[{ role: 'user' }]];
    params = p;
    return [{}];
  };
  const req = { user: { id: 5, role: 'head_admin' }, params: { id: '2' }, body: { is_active: true } };
  const res = mockRes();
  await ctrl.setStatus(req, res);
  db.query = originalQuery;

  assert.deepEqual(params, [1, '2']);
  assert.equal(res.body.is_active, 1);
});

test('deleteUser — rejects deleting your own account', async () => {
  const req = { user: { id: 5, role: 'head_admin' }, params: { id: '5' } };
  const res = mockRes();
  await ctrl.deleteUser(req, res);
  assert.equal(res.statusCode, 400);
});

test('deleteUser — deletes another user by id', async () => {
  const originalQuery = db.query;
  let params;
  let call = 0;
  db.query = async (sql, p) => {
    call++;
    if (call === 1) return [[{ role: 'user' }]];
    params = p;
    return [{}];
  };
  const req = { user: { id: 5, role: 'head_admin' }, params: { id: '2' } };
  const res = mockRes();
  await ctrl.deleteUser(req, res);
  db.query = originalQuery;

  assert.deepEqual(params, ['2']);
  assert.equal(res.statusCode, 200);
});

test('deleteUser — refuses to delete another head_admin\'s account', async () => {
  const originalQuery = db.query;
  db.query = async () => [[{ role: 'head_admin' }]];
  const req = { user: { id: 5, role: 'head_admin' }, params: { id: '2' } };
  const res = mockRes();
  await ctrl.deleteUser(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 403);
});

test('deleteNullResponses — deletes only responses with a NULL overall_score for the given survey', async () => {
  const originalQuery = db.query;
  let sql, params;
  db.query = async (s, p) => { sql = s; params = p; return [{ affectedRows: 3 }]; };
  const req = { params: { surveyId: '10' } };
  const res = mockRes();
  await ctrl.deleteNullResponses(req, res);
  db.query = originalQuery;

  assert.match(sql, /overall_score IS NULL/);
  assert.deepEqual(params, ['10']);
  assert.equal(res.body.deleted, 3);
});

test('listUsers — a DB error is reported as a generic 500, not leaked to the client', async () => {
  const originalQuery = db.query;
  db.query = async () => { throw new Error('ECONNRESET'); };
  const req = {};
  const res = mockRes();
  await ctrl.listUsers(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 500);
  assert.doesNotMatch(JSON.stringify(res.body), /ECONNRESET/);
});
