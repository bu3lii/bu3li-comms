-- Generalizes message_attachments beyond voice: images and video carry
-- optional pixel dimensions so the UI can lay out a lightbox/player without
-- waiting for the media to load.
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS width_px INTEGER;
ALTER TABLE message_attachments ADD COLUMN IF NOT EXISTS height_px INTEGER;

CREATE TABLE IF NOT EXISTS user_avatars (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    mime_type TEXT NOT NULL,
    data BYTEA NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
