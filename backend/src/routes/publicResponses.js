const router = require('express').Router();
const ctrl = require('../controllers/publicResponseController');
const createPublicLimiter = require('../middleware/publicLimiter');

// Public — no auth — called by Google Apps Script
router.post('/form/:formId', createPublicLimiter(), ctrl.submitFromGoogleForm);

module.exports = router;
