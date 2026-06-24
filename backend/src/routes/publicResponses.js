const router = require('express').Router();
const ctrl   = require('../controllers/publicResponseController');

// Public — no auth — called by Google Apps Script
router.post('/form/:formId', ctrl.submitFromGoogleForm);

module.exports = router;
