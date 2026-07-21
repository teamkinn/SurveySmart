const test = require('node:test');
const assert = require('node:assert/strict');

const router = require('../src/routes/publicResponses');
const { verifyWebhookSecret } = router;
const { mockRes } = require('./helpers/mockReqRes');
const db = require('../src/config/db'); // pulled in transitively via the controller

// See responseController.test.js — closes the mysql2 pool so the process
// can exit cleanly instead of hanging on a background connection timer.
test.after(async () => {
  try { await db.end(); } catch { /* nothing was ever connected */ }
});

test('webhook secret check is skipped (opt-in) when GOOGLE_FORMS_WEBHOOK_SECRET is unset', () => {
  delete process.env.GOOGLE_FORMS_WEBHOOK_SECRET;
  const req = { headers: {}, query: {} };
  const res = mockRes();
  let nextCalled = false;
  verifyWebhookSecret(req, res, () => { nextCalled = true; });
  assert.equal(nextCalled, true, 'unset secret must not block existing deployments');
});

test('webhook secret check rejects a request with no secret when one is configured', () => {
  process.env.GOOGLE_FORMS_WEBHOOK_SECRET = 'shh-its-a-secret';
  const req = { headers: {}, query: {} };
  const res = mockRes();
  let nextCalled = false;
  verifyWebhookSecret(req, res, () => { nextCalled = true; });
  delete process.env.GOOGLE_FORMS_WEBHOOK_SECRET;

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('webhook secret check rejects an incorrect secret', () => {
  process.env.GOOGLE_FORMS_WEBHOOK_SECRET = 'shh-its-a-secret';
  const req = { headers: { 'x-webhook-secret': 'wrong-guess' }, query: {} };
  const res = mockRes();
  let nextCalled = false;
  verifyWebhookSecret(req, res, () => { nextCalled = true; });
  delete process.env.GOOGLE_FORMS_WEBHOOK_SECRET;

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
});

test('webhook secret check accepts a matching X-Webhook-Secret header', () => {
  process.env.GOOGLE_FORMS_WEBHOOK_SECRET = 'shh-its-a-secret';
  const req = { headers: { 'x-webhook-secret': 'shh-its-a-secret' }, query: {} };
  const res = mockRes();
  let nextCalled = false;
  verifyWebhookSecret(req, res, () => { nextCalled = true; });
  delete process.env.GOOGLE_FORMS_WEBHOOK_SECRET;

  assert.equal(nextCalled, true);
});

test('webhook secret check accepts a matching ?secret= query param', () => {
  process.env.GOOGLE_FORMS_WEBHOOK_SECRET = 'shh-its-a-secret';
  const req = { headers: {}, query: { secret: 'shh-its-a-secret' } };
  const res = mockRes();
  let nextCalled = false;
  verifyWebhookSecret(req, res, () => { nextCalled = true; });
  delete process.env.GOOGLE_FORMS_WEBHOOK_SECRET;

  assert.equal(nextCalled, true);
});
