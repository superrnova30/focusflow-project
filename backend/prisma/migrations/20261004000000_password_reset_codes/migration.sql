-- Persist hashed password-reset codes so they survive restarts and can be validated.
ALTER TABLE "User" ADD COLUMN "passwordResetCodeHash" TEXT;
ALTER TABLE "User" ADD COLUMN "passwordResetExpires" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "passwordResetAttempts" INTEGER NOT NULL DEFAULT 0;
