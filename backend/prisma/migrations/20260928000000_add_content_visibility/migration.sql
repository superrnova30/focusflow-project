-- AlterTable
ALTER TABLE "FlashcardCollection" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "StudyNote" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "FlashcardCollection_userId_isPublic_idx" ON "FlashcardCollection"("userId", "isPublic");

-- CreateIndex
CREATE INDEX "StudyNote_userId_isPublic_idx" ON "StudyNote"("userId", "isPublic");
