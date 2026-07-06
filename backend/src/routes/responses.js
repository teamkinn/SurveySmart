const router = require('express').Router({ mergeParams: true });
const ctrl = require('../controllers/responseController');
const auth = require('../middleware/auth');

router.get('/', auth, ctrl.list);
router.post('/', ctrl.submit);
router.get('/stats', auth, ctrl.stats);
router.get('/chart-data', auth, ctrl.chartData);

module.exports = router;
