CREATE TABLE user_dashboards (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    widgets JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(widgets) = 'array'),
    revision BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX user_dashboards_owner_idx ON user_dashboards(user_id, created_at);
CREATE TABLE service_subscriptions (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    service TEXT NOT NULL CHECK (service IN ('spotify', 'gmail', 'google_calendar', 'github')),
    PRIMARY KEY (user_id, service)
);
