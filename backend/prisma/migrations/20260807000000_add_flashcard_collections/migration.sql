-- CreateTable
CREATE TABLE "FlashcardCollection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlashcardCollection_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Flashcard" DROP CONSTRAINT "Flashcard_materialId_fkey",
ALTER COLUMN "materialId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Flashcard" ADD COLUMN     "collectionId" TEXT;

-- CreateIndex
CREATE INDEX "FlashcardCollection_userId_idx" ON "FlashcardCollection"("userId");

-- CreateIndex
CREATE INDEX "Flashcard_collectionId_idx" ON "Flashcard"("collectionId");

-- CreateIndex
CREATE INDEX "Flashcard_materialId_idx" ON "Flashcard"("materialId");

-- AddForeignKey
ALTER TABLE "FlashcardCollection" ADD CONSTRAINT "FlashcardCollection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_materialId_fkey" FOREIGN KEY ("materialId") REFERENCES "StudyMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Flashcard" ADD CONSTRAINT "Flashcard_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "FlashcardCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

