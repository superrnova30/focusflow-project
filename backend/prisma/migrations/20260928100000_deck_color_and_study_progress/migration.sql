-- AlterTable
ALTER TABLE "FlashcardCollection" ADD COLUMN "color" TEXT NOT NULL DEFAULT 'violet';

-- CreateTable
CREATE TABLE "DeckStudyProgress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "practiceAnswered" INTEGER NOT NULL DEFAULT 0,
    "practiceUnlocked" BOOLEAN NOT NULL DEFAULT false,
    "memorizeSessions" INTEGER NOT NULL DEFAULT 0,
    "tutorCompleted" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeckStudyProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeckStudyProgress_userId_collectionId_key" ON "DeckStudyProgress"("userId", "collectionId");

-- CreateIndex
CREATE INDEX "DeckStudyProgress_userId_idx" ON "DeckStudyProgress"("userId");

-- AddForeignKey
ALTER TABLE "DeckStudyProgress" ADD CONSTRAINT "DeckStudyProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeckStudyProgress" ADD CONSTRAINT "DeckStudyProgress_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "FlashcardCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
