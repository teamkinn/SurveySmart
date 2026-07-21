const router = require('express').Router();
const ctrl = require('../controllers/publicResponseController');
const createPublicLimiter = require('../middleware/publicLimiter');

// Optional shared-secret check for the Apps Script webhook. Without it,
// anyone who learns a survey's google_form_id (not treated as secret
// elsewhere in the app) could POST forged responses straight to the DB —
// the rate limiter alone only slows that down, it doesn't prevent it.
// Skipped entirely when GOOGLE_FORMS_WEBHOOK_SECRET is unset, so existing
// deployments/Apps Script scripts keep working without changes; set it
// (and send it back as the `X-Webhook-Secret` header or `?secret=` query
// param from the Apps Script side) to close this off in production.
function verifyWebhookSecret(req, res, next) {
  const expected = process.env.GOOGLE_FORMS_WEBHOOK_SECRET;
  if (!expected) return next();
  const provided = req.headers['x-webhook-secret'] || req.query.secret;
  if (provided !== expected) {
    return res.status(401).json({ message: 'Unauthorized webhook request' });
  }
  next();
}

// Public — no auth — called by Google Apps Script
router.post('/form/:formId', createPublicLimiter(), verifyWebhookSecret, ctrl.submitFromGoogleForm);

module.exports = router;
// Exposed for unit testing — Router instances are functions, so attaching a
// property here doesn't change how the router itself is required/mounted.
module.exports.verifyWebhookSecret = verifyWebhookSecret;
