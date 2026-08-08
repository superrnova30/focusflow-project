-- CreateTable
CREATE TABLE "StudyNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "aiSummary" TEXT,
    "aiKeyConcepts" JSONB,
    "aiImportantTerms" JSONB,
    "aiStudyTips" JSONB,
    "aiLearningObjectives" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudyNote_userId_idx" ON "StudyNote"("userId");

-- AddForeignKey
ALTER TABLE "StudyNote" ADD CONSTRAINT "StudyNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
