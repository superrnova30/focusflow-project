-- Add missing archived columns before index creation.
ALTER TABLE "Task"
ADD COLUMN IF NOT EXISTS "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);

-- DropIndex
DROP INDEX IF EXISTS "DailyChallenge_date_key_idx";

-- DropIndex
DROP INDEX IF EXISTS "DailyChallengeCompletion_userId_idx";

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Task_userId_archived_idx" ON "Task"("userId", "archived");
