-- Persist the student's timezone so consecutive-day streaks follow their
-- local calendar rather than UTC.
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'UTC';
