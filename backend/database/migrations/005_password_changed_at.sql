-- Adds password_changed_at so the auth middleware can revoke JWTs that were
-- issued before a password reset. Without this, a token stolen before a
-- reset (or a still-open session on another device) keeps working until it
-- naturally expires (up to JWT_EXPIRES_IN, default 7 days) even after the
-- password has been changed.
ALTER TABLE users
  ADD COLUMN password_changed_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at;
