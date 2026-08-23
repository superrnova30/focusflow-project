-- Add archived columns to Task if they are missing.
ALTER TABLE "Task"
ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
