const router = require('express').Router();
const auth = require('../middleware/auth');
const isAdmin = require('../middleware/isAdmin');
const ctrl = require('../controllers/adminController');

router.use(auth, isAdmin);

router.get('/users', ctrl.listUsers);
router.patch('/users/:id/role', ctrl.setRole);
router.delete('/users/:id', ctrl.deleteUser);
router.delete('/surveys/:surveyId/responses/nullscore', ctrl.deleteNullResponses);

module.exports = router;
