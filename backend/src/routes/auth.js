const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/authController');
const auth = require('../middleware/auth');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'คำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่' },
});

router.post('/register', authLimiter, ctrl.register);
router.post('/login', authLimiter, ctrl.login);
router.post('/forgot-password', authLimiter, ctrl.forgot);
router.post('/reset-password', authLimiter, ctrl.resetPassword);
router.get('/me', auth, ctrl.me);

module.exports = router;
