// Sends transactional email (currently: password-reset OTP codes).
//
// Why not just SMTP: Railway disables outbound SMTP on its Free/Trial/Hobby
// plans (https://docs.railway.com/networking/outbound-networking), so the
// nodemailer/SMTP path silently can't deliver anything in production there
// — the forgot-password flow looked like it worked but no email ever
// arrived. Resend's HTTPS API goes out over port 443, which is allowed.
//
// Picks the first configured transport, in order:
//   1. BREVO_API_KEY set   -> Brevo HTTPS API. Only needs ONE verified sender
//                             address (e.g. a Gmail address) — no domain —
//                             and can then send to anyone.
//   2. RESEND_API_KEY set  -> Resend HTTPS API. Without a verified domain it
//                             can only send to the Resend account's own email.
//   3. MAIL_HOST set       -> SMTP via nodemailer (fine for local dev / Pro plan)
//   4. none of the above   -> returns 'none'; the caller logs the code instead
//
// Returns which transport was used. Throws if a configured transport fails,
// so the caller can surface a real error instead of pretending it sent.
const nodemailer = require('nodemailer');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

// "SurveySmart <no-reply@x.com>" -> { name: 'SurveySmart', email: 'no-reply@x.com' }
// "no-reply@x.com"               -> { name: 'SurveySmart', email: 'no-reply@x.com' }
function parseAddress(value, defaultName = 'SurveySmart') {
  const v = String(value || '').trim();
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].trim() || defaultName, email: m[2].trim() };
  return { name: defaultName, email: v };
}

async function sendViaBrevo({ to, subject, html }) {
  const sender = parseAddress(process.env.MAIL_FROM);
  if (!sender.email) {
    throw new Error('MAIL_FROM must be set to the Brevo-verified sender address when using BREVO_API_KEY');
  }
  const resp = await fetch(BREVO_ENDPOINT, {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!resp.ok) {
    let detail = '';
    try { detail = JSON.stringify(await resp.json()); } catch { /* non-JSON body */ }
    throw new Error(`Brevo API ${resp.status}: ${detail}`);
  }
}

async function sendViaResend({ to, subject, html }) {
  const from = process.env.MAIL_FROM || 'SurveySmart <onboarding@resend.dev>';
  const resp = await fetch(RESEND_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!resp.ok) {
    let detail = '';
    try { detail = JSON.stringify(await resp.json()); } catch { /* non-JSON body */ }
    throw new Error(`Resend API ${resp.status}: ${detail}`);
  }
}

async function sendViaSmtp({ to, subject, html }) {
  const transport = nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: parseInt(process.env.MAIL_PORT) || 587,
    secure: process.env.MAIL_SECURE === 'true',
    auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS },
  });
  await transport.sendMail({
    from: process.env.MAIL_FROM || process.env.MAIL_USER,
    to,
    subject,
    html,
  });
}

async function sendMail(message) {
  if (process.env.BREVO_API_KEY) {
    await sendViaBrevo(message);
    return 'brevo';
  }
  if (process.env.RESEND_API_KEY) {
    await sendViaResend(message);
    return 'resend';
  }
  if (process.env.MAIL_HOST) {
    await sendViaSmtp(message);
    return 'smtp';
  }
  return 'none';
}

module.exports = { sendMail, parseAddress, RESEND_ENDPOINT, BREVO_ENDPOINT };
