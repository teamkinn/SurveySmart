const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const ctrl = require('../src/controllers/albumController');
const { mockRes } = require('./helpers/mockReqRes');

test.after(async () => {
  try { await db.end(); } catch { /* nothing was ever connected */ }
});

test('list — returns only the caller\'s own albums with a survey_count subquery', async () => {
  const originalQuery = db.query;
  let capturedParams;
  db.query = async (sql, params) => {
    capturedParams = params;
    assert.match(sql, /FROM survey_albums a/);
    assert.match(sql, /WHERE a\.user_id = \?/);
    return [[{ id: 1, name: 'ความพึงพอใจ', color: '#1A56A0', survey_count: 2 }]];
  };
  const req = { user: { id: 5, role: 'user' } };
  const res = mockRes();
  await ctrl.list(req, res);
  db.query = originalQuery;

  assert.deepEqual(capturedParams, [5]);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body[0].survey_count, 2);
});

test('create — rejects a missing name', async () => {
  const req = { user: { id: 1 }, body: { name: '  ' } };
  const res = mockRes();
  await ctrl.create(req, res);
  assert.equal(res.statusCode, 400);
});

test('create — rejects a name over 100 characters', async () => {
  const req = { user: { id: 1 }, body: { name: 'x'.repeat(101) } };
  const res = mockRes();
  await ctrl.create(req, res);
  assert.equal(res.statusCode, 400);
});

test('create — an unrecognized color falls back to the default instead of storing arbitrary CSS', async () => {
  const originalQuery = db.query;
  let insertedColor;
  db.query = async (sql, params) => {
    insertedColor = params[2];
    return [{ insertId: 42 }];
  };
  const req = { user: { id: 1 }, body: { name: 'อัลบัมทดสอบ', color: 'red; background:url(evil)' } };
  const res = mockRes();
  await ctrl.create(req, res);
  db.query = originalQuery;

  assert.equal(insertedColor, '#1A56A0');
  assert.equal(res.statusCode, 201);
});

test('create — a non-string name (e.g. a number) is safely coerced instead of crashing with a 500 (regression test)', async () => {
  const originalQuery = db.query;
  db.query = async () => [{ insertId: 50 }];
  const req = { user: { id: 1 }, body: { name: 12345 } };
  const res = mockRes();
  // The old `(req.body.name || '').trim()` called .trim() directly on the
  // number 12345 (truthy, so it passes through the `||`) — numbers have no
  // .trim() method, so that threw a TypeError caught by the generic
  // try/catch and surfaced as an opaque 500 instead of handling the value.
  await ctrl.create(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 201);
  assert.equal(res.body.name, '12345');
});

test('create — an empty/whitespace-only string is still rejected with 400 after the sanitizeName fix', async () => {
  const req = { user: { id: 1 }, body: { name: '   ' } };
  const res = mockRes();
  await ctrl.create(req, res);
  assert.equal(res.statusCode, 400);
});

test('create — accepts a color from the allowed swatch palette', async () => {
  const originalQuery = db.query;
  let insertedColor;
  db.query = async (sql, params) => {
    insertedColor = params[2];
    return [{ insertId: 43 }];
  };
  const req = { user: { id: 1 }, body: { name: 'อัลบัมทดสอบ', color: '#C9A84C' } };
  const res = mockRes();
  await ctrl.create(req, res);
  db.query = originalQuery;

  assert.equal(insertedColor, '#C9A84C');
});

test('update — 404s on an album that does not belong to the caller', async () => {
  const originalQuery = db.query;
  db.query = async () => [[]];
  const req = { user: { id: 1 }, params: { id: '99' }, body: { name: 'ใหม่' } };
  const res = mockRes();
  await ctrl.update(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 404);
});

test('update — a partial PATCH (color only) keeps the existing name', async () => {
  const originalQuery = db.query;
  let updateParams;
  db.query = async (sql, params) => {
    if (sql.includes('SELECT id, name, color')) return [[{ id: 7, name: 'เดิม', color: '#1A56A0' }]];
    if (sql.startsWith('UPDATE')) { updateParams = params; return [{}]; }
    return [[]];
  };
  const req = { user: { id: 1 }, params: { id: '7' }, body: { color: '#166534' } };
  const res = mockRes();
  await ctrl.update(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 200);
  assert.deepEqual(updateParams, ['เดิม', '#166534', '7']);
});

test('update — an explicit name: null is rejected with 400, not silently saved as the string "null" (regression test)', async () => {
  const originalQuery = db.query;
  let updateCalled = false;
  db.query = async (sql) => {
    if (sql.includes('SELECT id, name, color')) return [[{ id: 7, name: 'เดิม', color: '#1A56A0' }]];
    if (sql.startsWith('UPDATE')) { updateCalled = true; return [{}]; }
    return [[]];
  };
  const req = { user: { id: 1 }, params: { id: '7' }, body: { name: null } };
  const res = mockRes();
  await ctrl.update(req, res);
  db.query = originalQuery;

  // The old `req.body.name !== undefined ? String(req.body.name).trim() : current.name`
  // let `null` (which IS !== undefined) through to String(null) === "null",
  // a non-empty string that passed the `!name` check and got saved as the
  // literal album name "null".
  assert.equal(res.statusCode, 400);
  assert.equal(updateCalled, false, 'must not reach the UPDATE query at all');
});

test('remove — 404s when nothing was deleted (not owned / does not exist)', async () => {
  const originalQuery = db.query;
  db.query = async () => [{ affectedRows: 0 }];
  const req = { user: { id: 1 }, params: { id: '5' } };
  const res = mockRes();
  await ctrl.remove(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 404);
});

test('remove — succeeds when a row was actually deleted', async () => {
  const originalQuery = db.query;
  db.query = async () => [{ affectedRows: 1 }];
  const req = { user: { id: 1 }, params: { id: '5' } };
  const res = mockRes();
  await ctrl.remove(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 200);
});

test('setSurveyAlbum — rejects a survey the caller does not own', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('FROM surveys')) return [[]];
    return [[]];
  };
  const req = { user: { id: 1 }, params: { id: '10' }, body: { album_id: 3 } };
  const res = mockRes();
  await ctrl.setSurveyAlbum(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 404);
});

test('setSurveyAlbum — rejects assigning to an album the caller does not own (cannot categorize into someone else\'s album)', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('FROM surveys')) return [[{ id: 10 }]];
    if (sql.includes('FROM survey_albums')) return [[]];
    return [[]];
  };
  const req = { user: { id: 1 }, params: { id: '10' }, body: { album_id: 999 } };
  const res = mockRes();
  await ctrl.setSurveyAlbum(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 404);
});

test('setSurveyAlbum — assigns a survey to an owned album', async () => {
  const originalQuery = db.query;
  let updateParams;
  db.query = async (sql, params) => {
    if (sql.includes('FROM surveys')) return [[{ id: 10 }]];
    if (sql.includes('FROM survey_albums')) return [[{ id: 3 }]];
    if (sql.startsWith('UPDATE')) { updateParams = params; return [{}]; }
    return [[]];
  };
  const req = { user: { id: 1 }, params: { id: '10' }, body: { album_id: 3 } };
  const res = mockRes();
  await ctrl.setSurveyAlbum(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 200);
  assert.deepEqual(updateParams, [3, '10']);
  assert.equal(res.body.album_id, 3);
});

test('setSurveyAlbum — album_id: null un-categorizes a survey without needing an album ownership check', async () => {
  const originalQuery = db.query;
  let updateParams;
  let albumOwnershipQueried = false;
  db.query = async (sql, params) => {
    if (sql.includes('FROM surveys')) return [[{ id: 10 }]];
    if (sql.includes('FROM survey_albums')) { albumOwnershipQueried = true; return [[]]; }
    if (sql.startsWith('UPDATE')) { updateParams = params; return [{}]; }
    return [[]];
  };
  const req = { user: { id: 1 }, params: { id: '10' }, body: { album_id: null } };
  const res = mockRes();
  await ctrl.setSurveyAlbum(req, res);
  db.query = originalQuery;

  assert.equal(albumOwnershipQueried, false);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(updateParams, [null, '10']);
});

test('setSurveyAlbum — rejects a non-integer album_id', async () => {
  const req = { user: { id: 1 }, params: { id: '10' }, body: { album_id: 'not-a-number' } };
  const res = mockRes();
  await ctrl.setSurveyAlbum(req, res);
  assert.equal(res.statusCode, 400);
});
