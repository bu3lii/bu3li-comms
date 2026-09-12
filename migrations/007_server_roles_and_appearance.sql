-- Localized (per-server) RBAC. The owner (server_members.role = 'owner')
-- always has every permission implicitly and isn't represented as a role
-- row; every other member has exactly one role via server_members.role_id,
-- defaulting to the server's is_default role (created alongside the server
-- and assigned whenever someone is added).
CREATE TABLE IF NOT EXISTS server_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#9298A6',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    position INTEGER NOT NULL DEFAULT 0,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_server BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_roles BOOLEAN NOT NULL DEFAULT FALSE,
    can_manage_channels BOOLEAN NOT NULL DEFAULT FALSE,
    can_kick_members BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_server_roles_server ON server_roles(server_id, position);

ALTER TABLE server_members ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES server_roles(id) ON DELETE SET NULL;

-- Server appearance: icon (picture) + banner, the same bytea-attachment
-- pattern already used for voice messages and user avatars.
CREATE TABLE IF NOT EXISTS server_icons (
    server_id UUID PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
    mime_type TEXT NOT NULL,
    data BYTEA NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS server_banners (
    server_id UUID PRIMARY KEY REFERENCES servers(id) ON DELETE CASCADE,
    mime_type TEXT NOT NULL,
    data BYTEA NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
