const test = require('node:test');
const assert = require('node:assert/strict');

const { sendMail, parseAddress, RESEND_ENDPOINT, BREVO_ENDPOINT } = require('../src/services/mailer');

const MAIL_VARS = ['BREVO_API_KEY', 'RESEND_API_KEY', 'MAIL_HOST', 'MAIL_FROM'];
function withEnv(vars, fn) {
  const saved = {};
  for (const k of MAIL_VARS) { saved[k] = process.env[k]; delete process.env[k]; }
  Object.assign(process.env, vars);
  return Promise.resolve(fn()).finally(() => {
    for (const k of MAIL_VARS) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
  });
}

const msg = { to: 'a@example.com', subject: 's', html: '<p>123456</p>' };

test('sendMail — nothing configured returns "none" and makes no network call', async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; };
  await withEnv({}, async () => {
    assert.equal(await sendMail(msg), 'none');
  });
  global.fetch = originalFetch;
  assert.equal(called, false);
});

test('sendMail — RESEND_API_KEY posts to the Resend HTTPS API (not SMTP, which Railway blocks)', async () => {
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (url, opts) => { captured = { url, opts }; return { ok: true, json: async () => ({ id: 'x' }) }; };
  await withEnv({ RESEND_API_KEY: 'key123', MAIL_HOST: 'smtp.example.com', MAIL_FROM: 'SS <no-reply@x.com>' }, async () => {
    assert.equal(await sendMail(msg), 'resend');
  });
  global.fetch = originalFetch;

  assert.equal(captured.url, RESEND_ENDPOINT);
  assert.equal(captured.opts.headers.Authorization, 'Bearer key123');
  const body = JSON.parse(captured.opts.body);
  assert.deepEqual(body.to, ['a@example.com']);
  assert.equal(body.from, 'SS <no-reply@x.com>');
  assert.equal(body.html, msg.html);
});

test('sendMail — a Resend API error is thrown, not swallowed as success', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 403, json: async () => ({ message: 'domain not verified' }) });
  await withEnv({ RESEND_API_KEY: 'key123' }, async () => {
    await assert.rejects(() => sendMail(msg), /Resend API 403/);
  });
  global.fetch = originalFetch;
});

test('sendMail — BREVO_API_KEY posts to Brevo with the api-key header and a parsed sender (takes priority over Resend)', async () => {
  const originalFetch = global.fetch;
  let captured;
  global.fetch = async (url, opts) => { captured = { url, opts }; return { ok: true, json: async () => ({ messageId: 'm' }) }; };
  await withEnv({ BREVO_API_KEY: 'xkeysib-1', RESEND_API_KEY: 're_x', MAIL_FROM: 'SurveySmart <teamkinn@gmail.com>' }, async () => {
    assert.equal(await sendMail(msg), 'brevo');
  });
  global.fetch = originalFetch;

  assert.equal(captured.url, BREVO_ENDPOINT);
  assert.equal(captured.opts.headers['api-key'], 'xkeysib-1');
  const body = JSON.parse(captured.opts.body);
  assert.deepEqual(body.sender, { name: 'SurveySmart', email: 'teamkinn@gmail.com' });
  assert.deepEqual(body.to, [{ email: 'a@example.com' }]);
  assert.equal(body.htmlContent, msg.html);
});

test('sendMail — a Brevo error (e.g. unverified sender / unauthorised IP) is thrown with its detail', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ code: 'unauthorized', message: 'unrecognised IP address' }) });
  await withEnv({ BREVO_API_KEY: 'xkeysib-1', MAIL_FROM: 'teamkinn@gmail.com' }, async () => {
    await assert.rejects(() => sendMail(msg), /Brevo API 401.*unrecognised IP/);
  });
  global.fetch = originalFetch;
});

test('sendMail — Brevo without MAIL_FROM fails loudly instead of sending from an empty sender', async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; return { ok: true, json: async () => ({}) }; };
  await withEnv({ BREVO_API_KEY: 'xkeysib-1' }, async () => {
    await assert.rejects(() => sendMail(msg), /MAIL_FROM must be set/);
  });
  global.fetch = originalFetch;
  assert.equal(called, false);
});

test('parseAddress — handles "Name <email>", bare email and quoted names', () => {
  assert.deepEqual(parseAddress('SurveySmart <a@b.com>'), { name: 'SurveySmart', email: 'a@b.com' });
  assert.deepEqual(parseAddress('a@b.com'), { name: 'SurveySmart', email: 'a@b.com' });
  assert.deepEqual(parseAddress('"ระบบแบบสอบถาม" <a@b.com>'), { name: 'ระบบแบบสอบถาม', email: 'a@b.com' });
});
