-- Remove Teacher role: delete any accounts that still use the TEACHER role
-- (their dependent rows are cascade-deleted), then rebuild the enum.

DELETE FROM "User" WHERE "role" = 'TEACHER';

-- PostgreSQL has no ALTER TYPE ... DROP VALUE, so rebuild the enum:
-- 1. Rename the old enum
ALTER TYPE "Role" RENAME TO "Role_old";
-- 2. Create the new enum without TEACHER
CREATE TYPE "Role" AS ENUM ('STUDENT', 'ADMIN');
-- 3. Update the column to use the new enum
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "Role" USING ("role"::text::"Role");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'STUDENT';
-- 4. Drop the old enum
DROP TYPE "Role_old";

