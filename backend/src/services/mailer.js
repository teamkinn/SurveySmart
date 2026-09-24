// Sends transactional email (currently: password-reset OTP codes).
//
// Why not just SMTP: Railway disables outbound SMTP on its Free/Trial/Hobby
// plans (https://docs.railway.com/networking/outbound-networking), so the
// nodemailer/SMTP path silently can't deliver anything in production there
// — the forgot-password flow looked like it worked but no email ever
// arrived. Resend's HTTPS API goes out over port 443, which is allowed.
//
// Picks the first configured transport, in order:
//   1. RESEND_API_KEY set  -> Resend HTTPS API (use this on Railway)
//   2. MAIL_HOST set       -> SMTP via nodemailer (fine for local dev / Pro plan)
//   3. neither             -> returns 'none'; the caller logs the code instead
//
// Returns which transport was used. Throws if a configured transport fails,
// so the caller can surface a real error instead of pretending it sent.
const nodemailer = require('nodemailer');

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

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

module.exports = { sendMail, RESEND_ENDPOINT };
