CREATE TABLE IF NOT EXISTS message_attachments (
    message_id UUID PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    mime_type TEXT NOT NULL,
    duration_ms INTEGER NOT NULL,
    data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE messages ALTER COLUMN content DROP NOT NULL;
