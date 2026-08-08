-- AlterTable
ALTER TABLE "StudyMaterial" ADD COLUMN     "aiImportantTerms" JSONB,
ADD COLUMN     "aiLearningObjectives" JSONB,
ADD COLUMN     "aiPracticeQuestions" JSONB,
ADD COLUMN     "aiShortAnswer" JSONB;
