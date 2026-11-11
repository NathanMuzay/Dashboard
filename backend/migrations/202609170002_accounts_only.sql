-- Preserve migration history for installations that applied the first version.
DROP TABLE widgets;
DROP TABLE dashboards;

CREATE TABLE roles (name TEXT PRIMARY KEY);
INSERT INTO roles VALUES ('perso'), ('employe'), ('entreprise'), ('admin');
CREATE TABLE user_roles (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role TEXT NOT NULL REFERENCES roles(name),
    PRIMARY KEY (user_id, role)
);
INSERT INTO user_roles
SELECT DISTINCT user_id, 'perso' FROM user_profiles;
INSERT INTO user_roles
SELECT user_id, 'admin' FROM user_permissions WHERE permission = 'administrator'
ON CONFLICT DO NOTHING;
INSERT INTO user_roles
SELECT DISTINCT user_id, 'employe' FROM company_memberships
ON CONFLICT DO NOTHING;
INSERT INTO user_roles
SELECT id, 'perso' FROM users u WHERE NOT EXISTS (SELECT 1 FROM user_roles r WHERE r.user_id = u.id);

-- Existing sessions predate role selection: require a fresh login.
DELETE FROM sessions;
ALTER TABLE sessions ADD COLUMN role TEXT NOT NULL;
ALTER TABLE sessions ADD CONSTRAINT sessions_user_role_fk
    FOREIGN KEY (user_id, role) REFERENCES user_roles(user_id, role) ON DELETE CASCADE;
DROP TABLE user_profiles;
DROP TABLE profile_types;
DROP TABLE user_permissions;
DROP TABLE permissions;
