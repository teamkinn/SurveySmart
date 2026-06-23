const router = require('express').Router();
const ctrl   = require('../controllers/notificationController');
const auth   = require('../middleware/auth');

router.use(auth);

router.get('/',              ctrl.list);
router.patch('/:id/read',   ctrl.markRead);
router.patch('/read-all',   ctrl.markAllRead);

module.exports = router;
