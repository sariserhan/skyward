CREATE INDEX IF NOT EXISTS session_expiry ON session(expiresAt);
CREATE INDEX IF NOT EXISTS verification_expiry ON verification(expiresAt);
CREATE INDEX IF NOT EXISTS rate_limit_expiry ON rateLimit(lastRequest);
CREATE INDEX IF NOT EXISTS user_verification_age ON user(emailVerified,createdAt);
