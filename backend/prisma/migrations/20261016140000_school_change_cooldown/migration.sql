-- Persist last successful school change/removal for the 7-day cooldown.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "schoolChangedAt" TIMESTAMP(3);
