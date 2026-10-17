CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "logoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "nameKey" TEXT NOT NULL,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "School_nameKey_key" ON "School"("nameKey");
CREATE INDEX "School_status_idx" ON "School"("status");
CREATE INDEX "School_name_idx" ON "School"("name");
CREATE INDEX "School_location_idx" ON "School"("location");

ALTER TABLE "User" ADD COLUMN "schoolId" TEXT;
CREATE INDEX "User_schoolId_idx" ON "User"("schoolId");

ALTER TABLE "User" ADD CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "School" ADD CONSTRAINT "School_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "School" ("id", "name", "location", "type", "status", "nameKey", "createdAt", "updatedAt")
SELECT
    'sch_' || md5(lower(trim(u.school))),
    MIN(trim(u.school)),
    'Unknown location',
    'UNIVERSITY',
    'APPROVED',
    lower(trim(u.school)) || '|unknown location',
    NOW(),
    NOW()
FROM "User" u
WHERE u.school IS NOT NULL AND trim(u.school) <> ''
GROUP BY lower(trim(u.school));

UPDATE "User" u
SET "schoolId" = s.id
FROM "School" s
WHERE u.school IS NOT NULL
  AND trim(u.school) <> ''
  AND s."nameKey" = lower(trim(u.school)) || '|unknown location';
