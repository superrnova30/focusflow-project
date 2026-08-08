-- Add gamification polish fields to User + DeviceToken + DailyChallenge tables.

-- User: streak / level / challenge tracking
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "streakCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "longestStreak" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastActiveDate" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "currentLevel" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "challengesCompleted" INTEGER NOT NULL DEFAULT 0;

-- DeviceToken (push notifications)
CREATE TABLE IF NOT EXISTS "DeviceToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'unknown',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeviceToken_pkey" PRIMARY KEY ("id")
);

-- Daily challenges
CREATE TABLE IF NOT EXISTS "DailyChallenge" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "xpReward" INTEGER NOT NULL DEFAULT 100,
    "targetValue" INTEGER NOT NULL DEFAULT 1,
    "metric" TEXT NOT NULL DEFAULT 'quiz_correct',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyChallenge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DailyChallenge_date_key" ON "DailyChallenge"("date");
CREATE UNIQUE INDEX IF NOT EXISTS "DeviceToken_token_key" ON "DeviceToken"("token");
CREATE INDEX IF NOT EXISTS "DeviceToken_userId_idx" ON "DeviceToken"("userId");
CREATE INDEX IF NOT EXISTS "DailyChallenge_date_key_idx" ON "DailyChallenge"("date");

-- Completion join table
CREATE TABLE IF NOT EXISTS "DailyChallengeCompletion" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyChallengeCompletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DailyChallengeCompletion_challengeId_userId_key"
    ON "DailyChallengeCompletion"("challengeId", "userId");
CREATE INDEX IF NOT EXISTS "DailyChallengeCompletion_userId_idx" ON "DailyChallengeCompletion"("userId");

-- Foreign keys
ALTER TABLE "DeviceToken" ADD CONSTRAINT "DeviceToken_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyChallengeCompletion" ADD CONSTRAINT "DailyChallengeCompletion_challengeId_fkey"
    FOREIGN KEY ("challengeId") REFERENCES "DailyChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyChallengeCompletion" ADD CONSTRAINT "DailyChallengeCompletion_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
