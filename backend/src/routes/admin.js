const router = require('express').Router();
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');
const isHeadAdmin = require('../middleware/isHeadAdmin');
const ctrl = require('../controllers/adminController');

router.use(auth, isAdmin);

router.get('/users', ctrl.listUsers);
router.get('/surveys', ctrl.listSurveys);
router.patch('/users/:id/role', isHeadAdmin, ctrl.setRole);
router.patch('/users/:id/status', isHeadAdmin, ctrl.setStatus);
router.delete('/users/:id', isHeadAdmin, ctrl.deleteUser);
router.delete('/surveys/:surveyId/responses/nullscore', ctrl.deleteNullResponses);

module.exports = router;
