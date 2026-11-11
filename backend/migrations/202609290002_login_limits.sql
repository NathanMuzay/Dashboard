CREATE TABLE login_attempts (
    address_hash TEXT PRIMARY KEY,
    window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    attempts INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX login_attempts_window_idx ON login_attempts(window_start);
