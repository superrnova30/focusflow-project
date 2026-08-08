-- DropIndex
DROP INDEX "DailyChallenge_date_key_idx";

-- DropIndex
DROP INDEX "DailyChallengeCompletion_userId_idx";

-- CreateIndex
CREATE INDEX "Task_userId_archived_idx" ON "Task"("userId", "archived");
