ALTER TABLE "Flashcard" ADD COLUMN "answerHighlight" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Flashcard" ADD COLUMN "explanation" TEXT NOT NULL DEFAULT '';
ALTER TABLE "DeckStudyProgress" ADD COLUMN "tutorLessonAwards" JSONB NOT NULL DEFAULT '{}';
