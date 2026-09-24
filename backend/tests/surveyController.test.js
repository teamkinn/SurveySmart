const test = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/config/db');
const ctrl = require('../src/controllers/surveyController');
const { mockRes } = require('./helpers/mockReqRes');

test.after(async () => {
  try { await db.end(); } catch { /* nothing was ever connected */ }
});

// ---------- get() — access control ----------

test('get — the owner passes the access check (s.user_id = ?) and can view their own draft survey', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('LEFT JOIN survey_shares')) return [[{ id: 1 }]]; // owner match
    if (sql.includes('FROM surveys WHERE id')) return [[{ id: 1, user_id: 9, title: 'x' }]];
    if (sql.includes('FROM questions')) return [[]];
    return [[]];
  };
  const req = { user: { id: 9, role: 'user' }, params: { id: '1' } };
  const res = mockRes();
  await ctrl.get(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 200);
});

test('get — a non-owner with no share and no shared_all gets 404 (not 403 — existence is hidden)', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('LEFT JOIN survey_shares')) return [[]]; // access check fails
    return [[]];
  };
  const req = { user: { id: 2, role: 'user' }, params: { id: '1' } };
  const res = mockRes();
  await ctrl.get(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 404);
});

test('get — a user the survey was explicitly shared with can view it', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('LEFT JOIN survey_shares')) return [[{ id: 1 }]]; // access check passes
    if (sql.includes('FROM surveys WHERE id')) return [[{ id: 1, user_id: 9, title: 'x' }]];
    if (sql.includes('FROM questions')) return [[]];
    return [[]];
  };
  const req = { user: { id: 2, role: 'user' }, params: { id: '1' } };
  const res = mockRes();
  await ctrl.get(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 200);
});

test('get — admin/head_admin bypass the ownership/share check entirely', async () => {
  const originalQuery = db.query;
  let accessCheckRan = false;
  db.query = async (sql) => {
    if (sql.includes('LEFT JOIN survey_shares')) { accessCheckRan = true; return [[]]; }
    if (sql.includes('FROM surveys WHERE id')) return [[{ id: 1, user_id: 9, title: 'x' }]];
    if (sql.includes('FROM questions')) return [[]];
    return [[]];
  };
  const req = { user: { id: 999, role: 'admin' }, params: { id: '1' } };
  const res = mockRes();
  await ctrl.get(req, res);
  db.query = originalQuery;

  assert.equal(accessCheckRan, false, 'admin must skip the per-user access-check query');
  assert.equal(res.statusCode, 200);
});

// ---------- create() — payload limits ----------

test('create — rejects a survey with more than 300 questions', async () => {
  const req = {
    user: { id: 1 },
    body: { title: 'x', questions: Array.from({ length: 301 }, () => ({ text: 'q' })) },
  };
  const res = mockRes();
  await ctrl.create(req, res);
  assert.equal(res.statusCode, 400);
});

test('create — rejects a question whose options_json would exceed the size cap', async () => {
  const req = {
    user: { id: 1 },
    body: { title: 'x', questions: [{ text: 'q', options: Array.from({ length: 5000 }, () => 'a very long option value') }] },
  };
  const res = mockRes();
  await ctrl.create(req, res);
  assert.equal(res.statusCode, 400);
});

test('create — rejects a missing title', async () => {
  const req = { user: { id: 1 }, body: {} };
  const res = mockRes();
  await ctrl.create(req, res);
  assert.equal(res.statusCode, 400);
});

test('create — inserts a survey owned by the caller with a draft status and a share token', async () => {
  const originalQuery = db.query;
  let insertParams;
  db.query = async (sql, params) => {
    if (sql.startsWith('INSERT INTO surveys')) { insertParams = params; return [{ insertId: 55 }]; }
    if (sql.includes('SELECT v.*')) return [[{ id: 55, title: 'x' }]];
    return [[]];
  };
  const req = { user: { id: 1 }, body: { title: 'x' } };
  const res = mockRes();
  await ctrl.create(req, res);
  db.query = originalQuery;

  assert.equal(insertParams[0], 1); // user_id
  assert.equal(insertParams[3], 'draft'); // status
  assert.equal(res.statusCode, 201);
});

// ---------- update() — head_admin bypass + response-count guard ----------

test('update — a regular admin (not head_admin) editing someone else\'s survey 404s (ownership-scoped query)', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('SELECT title, description, status, close_date, target_responses FROM surveys WHERE id = ? AND user_id = ?')) return [[]];
    return [[]];
  };
  const req = { user: { id: 999, role: 'admin' }, params: { id: '1' }, body: { title: 'new' } };
  const res = mockRes();
  await ctrl.update(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 404);
});

test('update — head_admin can edit a survey they don\'t own (unscoped query)', async () => {
  const originalQuery = db.query;
  let usedUnscopedSelect = false;
  db.query = async (sql, params) => {
    if (sql === 'SELECT title, description, status, close_date, target_responses FROM surveys WHERE id = ?') {
      usedUnscopedSelect = true;
      return [[{ title: 'old', description: '', status: 'draft', close_date: null, target_responses: null }]];
    }
    if (sql.startsWith('UPDATE surveys')) return [{}];
    if (sql.includes('SELECT v.*')) return [[{ id: 1, title: 'new' }]];
    return [[]];
  };
  const req = { user: { id: 999, role: 'head_admin' }, params: { id: '1' }, body: { title: 'new' } };
  const res = mockRes();
  await ctrl.update(req, res);
  db.query = originalQuery;

  assert.equal(usedUnscopedSelect, true);
  assert.equal(res.statusCode, 200);
});

test('update — a partial update (status only) preserves the existing title/description', async () => {
  const originalQuery = db.query;
  let updateParams;
  db.query = async (sql, params) => {
    if (sql.includes('SELECT title, description, status, close_date, target_responses')) {
      return [[{ title: 'เดิม', description: 'คำอธิบายเดิม', status: 'draft', close_date: null, target_responses: null }]];
    }
    if (sql.startsWith('UPDATE surveys')) { updateParams = params; return [{}]; }
    if (sql.includes('SELECT v.*')) return [[{ id: 1 }]];
    return [[]];
  };
  const req = { user: { id: 1, role: 'user' }, params: { id: '1' }, body: { status: 'active' } };
  const res = mockRes();
  await ctrl.update(req, res);
  db.query = originalQuery;

  assert.equal(updateParams[0], 'เดิม');
  assert.equal(updateParams[1], 'คำอธิบายเดิม');
  assert.equal(updateParams[2], 'active');
});

test('update — refuses to replace questions once the survey has responses (409, data-loss guard)', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('SELECT title, description, status, close_date, target_responses')) {
      return [[{ title: 'x', description: '', status: 'active', close_date: null, target_responses: null }]];
    }
    if (sql.startsWith('UPDATE surveys')) return [{}];
    if (sql.includes('COUNT(*) AS c FROM responses')) return [[{ c: 5 }]];
    return [[]];
  };
  const req = { user: { id: 1, role: 'user' }, params: { id: '1' }, body: { questions: [{ text: 'q' }] } };
  const res = mockRes();
  await ctrl.update(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 409);
});

// ---------- remove() / publish() — head_admin bypass ----------

test('remove — a regular admin cannot delete a survey they don\'t own', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql === 'SELECT id FROM surveys WHERE id = ? AND user_id = ?') return [[]];
    return [[]];
  };
  const req = { user: { id: 999, role: 'admin' }, params: { id: '1' } };
  const res = mockRes();
  await ctrl.remove(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 404);
});

test('remove — head_admin can delete a survey they don\'t own', async () => {
  const originalQuery = db.query;
  let deleteRan = false;
  db.query = async (sql) => {
    if (sql === 'SELECT id FROM surveys WHERE id = ?') return [[{ id: 1 }]];
    if (sql.startsWith('DELETE')) { deleteRan = true; return [{}]; }
    return [[]];
  };
  const req = { user: { id: 999, role: 'head_admin' }, params: { id: '1' } };
  const res = mockRes();
  await ctrl.remove(req, res);
  db.query = originalQuery;

  assert.equal(deleteRan, true);
  assert.equal(res.statusCode, 200);
});

test('publish — a regular admin cannot publish a survey they don\'t own', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql === 'SELECT id FROM surveys WHERE id = ? AND user_id = ?') return [[]];
    return [[]];
  };
  const req = { user: { id: 999, role: 'admin' }, params: { id: '1' } };
  const res = mockRes();
  await ctrl.publish(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 404);
});

test('publish — the owner can publish their own survey and gets back its share_token', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql === 'SELECT id FROM surveys WHERE id = ? AND user_id = ?') return [[{ id: 1 }]];
    if (sql.startsWith("UPDATE surveys SET status='active'")) return [{}];
    if (sql === 'SELECT share_token FROM surveys WHERE id = ?') return [[{ share_token: 'abc123' }]];
    return [[]];
  };
  const req = { user: { id: 1, role: 'user' }, params: { id: '1' } };
  const res = mockRes();
  await ctrl.publish(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.share_token, 'abc123');
});

// ---------- share() / unshare() / shares() — owner only, active-user only ----------

test('share — rejects sharing with a suspended (is_active = 0) user', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('FROM surveys WHERE id')) return [[{ id: 1 }]];
    if (sql.includes('FROM users WHERE id = ? AND is_active = 1')) return [[]]; // suspended -> no row
    return [[]];
  };
  const req = { user: { id: 1 }, params: { id: '1' }, body: { user_id: 2 } };
  const res = mockRes();
  await ctrl.share(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 404);
});

test('share — rejects sharing a survey with yourself', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('FROM surveys WHERE id')) return [[{ id: 1 }]];
    if (sql.includes('FROM users WHERE id = ? AND is_active = 1')) return [[{ id: 1 }]];
    return [[]];
  };
  const req = { user: { id: 1 }, params: { id: '1' }, body: { user_id: 1 } };
  const res = mockRes();
  await ctrl.share(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 400);
});

test('share — a non-owner cannot share someone else\'s survey', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('FROM surveys WHERE id')) return [[]]; // ownership check fails
    return [[]];
  };
  const req = { user: { id: 2 }, params: { id: '1' }, body: { user_id: 3 } };
  const res = mockRes();
  await ctrl.share(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 404);
});

test('unshare — only the owner may revoke a share', async () => {
  const originalQuery = db.query;
  db.query = async (sql) => {
    if (sql.includes('FROM surveys WHERE id')) return [[]];
    return [[]];
  };
  const req = { user: { id: 2 }, params: { id: '1', userId: '3' } };
  const res = mockRes();
  await ctrl.unshare(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 404);
});

// ---------- setSharedAll() — owner-scoped UPDATE ----------

test('setSharedAll — the UPDATE is scoped to id AND user_id, so a non-owner\'s call affects zero rows -> 404', async () => {
  const originalQuery = db.query;
  let params;
  db.query = async (sql, p) => { params = p; return [{ affectedRows: 0 }]; };
  const req = { user: { id: 2 }, params: { id: '1' }, body: { enabled: true } };
  const res = mockRes();
  await ctrl.setSharedAll(req, res);
  db.query = originalQuery;

  assert.deepEqual(params, [1, '1', 2]);
  assert.equal(res.statusCode, 404);
});

// ---------- listOthers() — admin only ----------

test('listOthers — a regular user gets an empty list and the DB is never queried', async () => {
  const originalQuery = db.query;
  let queried = false;
  db.query = async () => { queried = true; return [[{ id: 1, share_token: 'secret' }]]; };
  const req = { user: { id: 1, role: 'user' } };
  const res = mockRes();
  await ctrl.listOthers(req, res);
  db.query = originalQuery;

  assert.equal(queried, false);
  assert.deepEqual(res.body, []);
});

test('listOthers — an admin gets every other user\'s surveys, drafts included, without share_token', async () => {
  const originalQuery = db.query;
  let capturedSql;
  db.query = async (sql) => { capturedSql = sql; return [[]]; };
  const req = { user: { id: 1, role: 'admin' } };
  const res = mockRes();
  await ctrl.listOthers(req, res);
  db.query = originalQuery;

  assert.doesNotMatch(capturedSql, /status != 'draft'/);
  assert.doesNotMatch(capturedSql, /vs\.\*/);
  assert.doesNotMatch(capturedSql, /share_token/);
});

test('listShared — never selects share_token (a shared viewer must not be able to submit as the owner\'s link)', async () => {
  const originalQuery = db.query;
  let capturedSql;
  db.query = async (sql) => { capturedSql = sql; return [[]]; };
  const req = { user: { id: 2, role: 'user' } };
  const res = mockRes();
  await ctrl.listShared(req, res);
  db.query = originalQuery;

  assert.doesNotMatch(capturedSql, /vs\.\*/);
  assert.doesNotMatch(capturedSql, /share_token/);
});

// ---------- getByToken() — public endpoint ----------

test('getByToken — 404s for an unknown or closed (non-active) share token', async () => {
  const originalQuery = db.query;
  db.query = async () => [[]];
  const req = { params: { token: 'nope' } };
  const res = mockRes();
  await ctrl.getByToken(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 404);
});

test('getByToken — returns the survey + questions and increments view_count for a valid active token', async () => {
  const originalQuery = db.query;
  let viewCountBumped = false;
  db.query = async (sql) => {
    if (sql.includes("status = 'active'")) return [[{ id: 1, title: 'x', description: '' }]];
    if (sql.includes('FROM questions')) return [[{ id: 1, question_text: 'q1' }]];
    if (sql.includes('view_count = view_count + 1')) { viewCountBumped = true; return [{}]; }
    return [[]];
  };
  const req = { params: { token: 'abc123' } };
  const res = mockRes();
  await ctrl.getByToken(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 200);
  assert.equal(viewCountBumped, true);
  assert.equal(res.body.questions.length, 1);
});

// ---------- getByToken() — close_date enforcement ----------

test('getByToken — only returns surveys still open by close_date, using the Thai calendar date', async () => {
  const { todayInBangkok } = require('../src/utils/bangkokDate');
  const originalQuery = db.query;
  let capturedSql, capturedParams;
  db.query = async (sql, params) => {
    if (sql.includes('FROM surveys') && sql.includes('share_token = ?')) {
      capturedSql = sql; capturedParams = params;
      return [[]];
    }
    return [[]];
  };
  const req = { params: { token: 'tok' } };
  const res = mockRes();
  await ctrl.getByToken(req, res);
  db.query = originalQuery;

  assert.match(capturedSql, /close_date IS NULL OR close_date >= \?/);
  assert.deepEqual(capturedParams, ['tok', todayInBangkok()]);
  assert.equal(res.statusCode, 404);
});

// ---------- update() — validation, write ordering, transaction ----------

test('update — an unknown status is rejected with 400 before touching the DB', async () => {
  const originalQuery = db.query;
  let queried = false;
  db.query = async () => { queried = true; return [[]]; };
  const req = { user: { id: 1, role: 'user' }, params: { id: '1' }, body: { status: 'archived' } };
  const res = mockRes();
  await ctrl.update(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 400);
  assert.equal(queried, false);
});

test('update — the 409 "has responses" guard runs before ANY write (no half-saved edit)', async () => {
  const originalQuery = db.query;
  const writes = [];
  db.query = async (sql) => {
    if (/^\s*(UPDATE|DELETE|INSERT)/i.test(sql)) writes.push(sql);
    if (sql.includes('SELECT title, description, status, close_date, target_responses')) {
      return [[{ title: 'x', description: '', status: 'active', close_date: null, target_responses: null }]];
    }
    if (sql.includes('COUNT(*) AS c FROM responses')) return [[{ c: 3 }]];
    return [[]];
  };
  const req = { user: { id: 1, role: 'user' }, params: { id: '1' }, body: { title: 'new title', questions: [{ text: 'q' }] } };
  const res = mockRes();
  await ctrl.update(req, res);
  db.query = originalQuery;

  assert.equal(res.statusCode, 409);
  assert.deepEqual(writes, []);
});

test('update — replacing questions runs in one transaction and rolls back if the INSERT fails', async () => {
  const originalQuery = db.query;
  const originalGetConnection = db.getConnection;
  const originalError = console.error;
  console.error = () => {};
  db.query = async (sql) => {
    if (sql.includes('SELECT title, description, status, close_date, target_responses')) {
      return [[{ title: 'x', description: '', status: 'draft', close_date: null, target_responses: null }]];
    }
    if (sql.includes('COUNT(*) AS c FROM responses')) return [[{ c: 0 }]];
    return [[]];
  };
  const log = [];
  db.getConnection = async () => ({
    beginTransaction: async () => log.push('begin'),
    query: async (sql) => {
      if (sql.trim().startsWith('INSERT INTO questions')) throw new Error('boom');
      log.push(sql.trim().split(/\s+/)[0]);
      return [{}];
    },
    commit: async () => log.push('commit'),
    rollback: async () => log.push('rollback'),
    release: () => log.push('release'),
  });
  const req = { user: { id: 1, role: 'user' }, params: { id: '1' }, body: { questions: [{ text: 'q1' }] } };
  const res = mockRes();
  await ctrl.update(req, res);
  db.query = originalQuery;
  db.getConnection = originalGetConnection;
  console.error = originalError;

  assert.deepEqual(log, ['begin', 'UPDATE', 'DELETE', 'rollback', 'release']);
  assert.equal(res.statusCode, 500);
});
