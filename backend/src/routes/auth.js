const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const ctrl = require('../controllers/authController');
const auth = require('../middleware/auth');

// A factory (not one shared instance) so register/login/forgot/reset each
// get their own independent per-IP counter — mirrors the same reasoning
// already documented on middleware/publicLimiter.js. A single shared
// instance meant a burst of registrations (or anything else) from other
// people on the same IP (office/campus NAT) could eat the whole budget and
// lock everyone on that IP out of login/password-reset for the window.
const makeAuthLimiter = () =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'คำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่' },
  });

router.post('/register', makeAuthLimiter(), ctrl.register);
router.post('/login', makeAuthLimiter(), ctrl.login);
router.post('/forgot-password', makeAuthLimiter(), ctrl.forgot);
router.post('/verify-reset-code', makeAuthLimiter(), ctrl.verifyResetCode);
router.post('/reset-password', makeAuthLimiter(), ctrl.resetPassword);
router.get('/me', auth, ctrl.me);

module.exports = router;
