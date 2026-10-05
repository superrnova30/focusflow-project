-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "school" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "Follow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Follow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ProfileActivity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ActivityReaction" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Follow_followerId_followingId_key" ON "Follow"("followerId", "followingId");
CREATE INDEX IF NOT EXISTS "Follow_followerId_idx" ON "Follow"("followerId");
CREATE INDEX IF NOT EXISTS "Follow_followingId_idx" ON "Follow"("followingId");

CREATE UNIQUE INDEX IF NOT EXISTS "ProfileActivity_userId_type_dedupeKey_key" ON "ProfileActivity"("userId", "type", "dedupeKey");
CREATE INDEX IF NOT EXISTS "ProfileActivity_userId_createdAt_idx" ON "ProfileActivity"("userId", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "ActivityReaction_activityId_userId_key" ON "ActivityReaction"("activityId", "userId");
CREATE INDEX IF NOT EXISTS "ActivityReaction_activityId_idx" ON "ActivityReaction"("activityId");

ALTER TABLE "Follow" DROP CONSTRAINT IF EXISTS "Follow_followerId_fkey";
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Follow" DROP CONSTRAINT IF EXISTS "Follow_followingId_fkey";
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProfileActivity" DROP CONSTRAINT IF EXISTS "ProfileActivity_userId_fkey";
ALTER TABLE "ProfileActivity" ADD CONSTRAINT "ProfileActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActivityReaction" DROP CONSTRAINT IF EXISTS "ActivityReaction_activityId_fkey";
ALTER TABLE "ActivityReaction" ADD CONSTRAINT "ActivityReaction_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "ProfileActivity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityReaction" DROP CONSTRAINT IF EXISTS "ActivityReaction_userId_fkey";
ALTER TABLE "ActivityReaction" ADD CONSTRAINT "ActivityReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
