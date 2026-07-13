const router = require('express').Router({ mergeParams: true });
const ctrl = require('../controllers/responseController');
const auth = require('../middleware/auth');
const createPublicLimiter = require('../middleware/publicLimiter');

router.get('/', auth, ctrl.list);
router.post('/', createPublicLimiter(), ctrl.submit);
router.get('/stats', auth, ctrl.stats);
router.get('/chart-data', auth, ctrl.chartData);

module.exports = router;
