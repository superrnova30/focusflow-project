-- Per-deck completion on tasks (drives task progress %).

ALTER TABLE "TaskDeck" ADD COLUMN IF NOT EXISTS "completed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "TaskDeck" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);
