-- Global user profile fields shared by platform and organization users.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS profile_preferences JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS profile_headline TEXT,
  ADD COLUMN IF NOT EXISTS biography TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS address JSONB;
