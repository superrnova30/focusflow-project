-- Durable per-user preference for the Profile Settings "Push notifications" toggle.
-- When false, the reminder scheduler and test-push endpoints must not deliver.
ALTER TABLE "User"
ADD COLUMN IF NOT EXISTS "pushNotificationsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: users who already registered a device token previously opted in.
UPDATE "User"
SET "pushNotificationsEnabled" = true
WHERE id IN (SELECT DISTINCT "userId" FROM "DeviceToken");
