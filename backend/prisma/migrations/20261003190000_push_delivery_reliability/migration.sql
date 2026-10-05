-- Track each device's timezone and last delivered reminder so the scheduler
-- can send at the student's local time without duplicate notifications.
ALTER TABLE "DeviceToken"
ADD COLUMN IF NOT EXISTS "timezone" TEXT NOT NULL DEFAULT 'UTC',
ADD COLUMN IF NOT EXISTS "lastReminderKey" TEXT,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
