-- Optional rich-text description (JSON blocks) for tasks
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "descriptionJson" JSONB;
