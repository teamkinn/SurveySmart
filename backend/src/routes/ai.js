const router = require('express').Router();
const auth   = require('../middleware/auth');
const ctrl   = require('../controllers/aiController');

router.use(auth);
router.post('/generate', ctrl.generateSurvey);

module.exports = router;
