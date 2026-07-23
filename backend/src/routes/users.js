const router = require('express').Router();
const ctrl = require('../controllers/userController');
const auth = require('../middleware/auth');

router.use(auth);

router.get('/search', ctrl.search);

module.exports = router;
