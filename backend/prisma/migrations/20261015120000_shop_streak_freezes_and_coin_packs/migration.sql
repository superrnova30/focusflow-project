ALTER TABLE "User" ADD COLUMN "streakFreezes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Payment" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'premium';
ALTER TABLE "Payment" ADD COLUMN "coinsGranted" INTEGER NOT NULL DEFAULT 0;
CREATE INDEX "Payment_userId_kind_status_idx" ON "Payment"("userId", "kind", "status");
