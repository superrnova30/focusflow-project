-- Task progress (0–100) and many-to-many link to flashcard decks.

ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "progress" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "TaskDeck" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskDeck_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TaskDeck_taskId_collectionId_key" ON "TaskDeck"("taskId", "collectionId");
CREATE INDEX IF NOT EXISTS "TaskDeck_taskId_idx" ON "TaskDeck"("taskId");
CREATE INDEX IF NOT EXISTS "TaskDeck_collectionId_idx" ON "TaskDeck"("collectionId");

DO $$ BEGIN
  ALTER TABLE "TaskDeck" ADD CONSTRAINT "TaskDeck_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "TaskDeck" ADD CONSTRAINT "TaskDeck_collectionId_fkey"
    FOREIGN KEY ("collectionId") REFERENCES "FlashcardCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
