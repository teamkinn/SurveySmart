const rateLimit = require('express-rate-limit');

// Applied to unauthenticated, internet-facing endpoints (survey view/submit,
// the Apps Script webhook) — generous enough for a real respondent filling
// out a form with retries, tight enough to blunt a spam/DoS flood from one IP.
// A factory (not a shared instance) so each route gets its own independent
// per-IP counter — otherwise, e.g., loading a survey repeatedly would eat
// into the budget for actually submitting it.
module.exports = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'คำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่' },
  });
