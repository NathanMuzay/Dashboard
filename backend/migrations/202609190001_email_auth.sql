-- Existing addresses are not considered verified without proof of mailbox ownership.
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
CREATE TABLE email_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose TEXT NOT NULL CHECK (purpose IN ('verify', 'magic', 'reset')),
    expires_at TIMESTAMPTZ NOT NULL,
    UNIQUE (user_id, purpose)
);
CREATE INDEX email_tokens_expiry_idx ON email_tokens(expires_at);
-- One shared allowance per address across all three email flows (including unknown addresses).
CREATE TABLE email_requests (
    address_hash TEXT PRIMARY KEY,
    window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    requests INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX email_requests_window_idx ON email_requests(window_start);
