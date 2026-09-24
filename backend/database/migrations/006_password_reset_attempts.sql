-- Counts wrong-code guesses against a user's outstanding password-reset
-- OTPs. A 6-digit code only has 1,000,000 possibilities and the per-IP rate
-- limit alone doesn't bound guesses per code (several IPs, or the separate
-- verify/reset limiters, each get their own budget). authController marks
-- every outstanding code for the user as used once this reaches 5, so a
-- code can only be guessed at 5 times before the user must request a new one.
ALTER TABLE password_resets
  ADD COLUMN attempts TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER used;
