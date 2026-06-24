const router = require('express').Router();
const ctrl   = require('../controllers/surveyController');
const auth   = require('../middleware/auth');

// Public route (no auth) — for respondents scanning QR / opening share link
router.get('/public/:token', ctrl.getByToken);

router.use(auth);

router.get('/stats',          ctrl.stats);
router.get('/shared',         ctrl.listShared);
router.get('/others',         ctrl.listOthers);
router.get('/',               ctrl.list);
router.get('/:id',            ctrl.get);
router.post('/',              ctrl.create);
router.put('/:id',            ctrl.update);
router.delete('/:id',         ctrl.remove);
router.patch('/:id/publish',  ctrl.publish);
router.post('/:id/share',     ctrl.share);

module.exports = router;
