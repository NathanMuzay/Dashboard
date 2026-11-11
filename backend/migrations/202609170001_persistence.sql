CREATE TABLE users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL CHECK (length(btrim(email)) > 0),
    name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE profile_types (name TEXT PRIMARY KEY);
INSERT INTO profile_types VALUES ('personal'), ('client');
CREATE TABLE user_profiles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    profile TEXT NOT NULL REFERENCES profile_types(name),
    PRIMARY KEY (user_id, profile)
);
CREATE TABLE companies (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL CHECK (length(btrim(name)) > 0)
);
CREATE TABLE company_memberships (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, company_id)
);
CREATE INDEX company_memberships_company_idx ON company_memberships(company_id);
CREATE TABLE permissions (name TEXT PRIMARY KEY);
INSERT INTO permissions VALUES ('administrator');
CREATE TABLE user_permissions (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission TEXT NOT NULL REFERENCES permissions(name),
    PRIMARY KEY (user_id, permission)
);
CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days'
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expiry_idx ON sessions(expires_at);

-- One dashboard per account for now; widgets already reference a dashboard.
CREATE TABLE dashboards (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    manual_rows INTEGER NOT NULL DEFAULT 3 CHECK (manual_rows > 0)
);
CREATE TABLE widgets (
    id UUID PRIMARY KEY,
    dashboard_id UUID NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
    widget_type TEXT NOT NULL CHECK (length(btrim(widget_type)) BETWEEN 1 AND 100),
    x INTEGER NOT NULL CHECK (x BETWEEN 1 AND 12),
    y INTEGER NOT NULL CHECK (y >= 1),
    width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 12),
    height INTEGER NOT NULL CHECK (height > 0),
    sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
    config JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(config) = 'object'),
    data JSONB NOT NULL DEFAULT 'null',
    CHECK (width <= 13 - x),
    CHECK (y::BIGINT + height::BIGINT <= 2147483647)
);
CREATE INDEX widgets_dashboard_order_idx ON widgets(dashboard_id, sort_order, id);
