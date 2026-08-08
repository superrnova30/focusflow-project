...............................................# FocusFlow AI Study & Flashcard Implementation

## Backend
- [x] 1. Update `prisma/schema.prisma` — Add `FlashcardCollection` model, make `Flashcard.materialId` optional, add `collectionId`
- [x] 2. Create migration SQL for flashcard collections
- [x] 3. Update `src/lib/ai.js` — Add `generateFlashcards()` for Magic Import, support topic-only generation
- [x] 4. Update `src/routes/materials.js` — Real PDF text extraction, topic-only generation support
- [x] 5. Create `src/routes/flashcards.js` — Collections CRUD, flashcard CRUD, Magic Import endpoint
- [x] 6. Update `src/index.js` — Mount `/api/flashcards` route

## Mobile
- [x] 7. Redesign `StudyHomeScreen.js` — "What shall we study today?" AI home with topic/notes/PDF
- [x] 8. Create `FlashcardCollectionsScreen.js` — List/manage collections, Magic Import entry
- [x] 9. Create `FlashcardCollectionScreen.js` — View cards in collection, add/edit/delete
- [x] 10. Create `FlashcardEditScreen.js` — Create/edit a card (front/back)
- [x] 11. Create `FlashcardStudyScreen.js` — Flip-card study mode
- [x] 12. Create `MagicImportScreen.js` — Source selector → AI generates flashcards
- [x] 13. Update `App.js` — Student login lands on Study tab, register new screens
- [x] 14. Update `MaterialDetailScreen.js` — Add "Take quiz" button

## Follow-up
- [x] 15. Run `npx prisma migrate dev` + `npx prisma generate` — applied `20260806160000_remove_teacher_role` + `20260807000000_add_flashcard_collections`, DB in sync, Prisma Client regenerated (v5.22.0)
- [x] 16. Restart backend, verify flows — server starts cleanly on port 4100, `/api/flashcards` route loads, `pdf-parse` + Prisma client confirmed
