-- Memorize mode: hints, heart refill tracking, quiz settings
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hints" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "heartsDepletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "memorizeSettings" JSONB;
