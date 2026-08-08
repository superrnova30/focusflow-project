-- Add gamification fields (XP + Hearts) to User
ALTER TABLE "User"
  ADD COLUMN "xp"            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "hearts"        INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN "correctAnswers" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "wrongAnswers"  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "totalXpEarned" INTEGER NOT NULL DEFAULT 0;
