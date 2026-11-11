CREATE TABLE oidc_challenges (
    nonce_hash TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '10 minutes'
);
CREATE TABLE google_identities (
    subject TEXT PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
);
