# Study Section Redesign — Plan

## Goal
Redesign the Student Study section with a modern, Notion/Quizlet/Google-Keep-like UX:
- Floating **(+)** Add button on the Study home screen
- Bottom sheet with **Cards** and **Notes** options
- **Cards** → Magic Import (AI) or Write Your Own (manual flashcards)
- **Notes** → Magic Import (AI-generated structured notes) or Write Your Own (rich-text editor)

## Files to Create

### Mobile
1. `mobile/src/components/BottomSheet.js` — Reusable animated bottom-sheet/modal component (slide-up, backdrop fade, rounded corners, safe-area aware, theme aware).
2. `mobile/src/components/RichTextEditor.js` — Lightweight rich-text editor supporting headings, bold/italic/underline, bullet/numbered lists, checklists (toggle via formatting toolbar; renders as styled text).
3. `mobile/src/screens/StudyNotesScreen.js` — Lists all notes (AI + manual), with create/edit/delete.
4. `mobile/src/screens/NoteEditScreen.js` — Rich-text editor screen for writing/editing notes, plus delete.
5. `mobile/src/screens/NoteViewScreen.js` — Read-only rendered note view.
6. `mobile/src/screens/CardImportScreen.js` — Cards → Magic Import modal/screen (PDF upload / paste notes / type topic → AI generates flashcards → review before saving into a deck).
7. `mobile/src/screens/NoteImportScreen.js` — Notes → Magic Import modal/screen (PDF / paste notes / type topic → AI generates structured notes → preview → save).

### Backend
8. `backend/src/routes/notes.js` — Notes CRUD (StudyNote model: title, contentJson, source, ai metadata).
9. Update `backend/src/index.js` — Mount `/api/notes`.
10. Update `backend/prisma/schema.prisma` — Add `StudyNote` model.
11. Create migration SQL `backend/prisma/migrations/<ts>_add_study_notes/migration.sql`.
12. Update `backend/src/lib/ai.js` — Add `generateStudyNotes()` (returns Lesson Summary, Key Concepts, Important Terms, Study Tips, Learning Objectives).

## Files to Edit

### Mobile
13. `mobile/src/screens/StudyHomeScreen.js` — Full redesign:
    - Hero + stats overview (cards count, notes count, study packs, quizzes)
    - Floating (+) button (always visible, bottom-right)
    - Tapping (+) opens the `AddBottomSheet` with **Cards** and **Notes** options
    - Cards → sub-sheet or navigate to Cards options (**Magic Import** / **Write Your Own**)
    - Notes → sub-sheet or navigate to Notes options (**Magic Import** / **Write Your Own**)
    - Keep access to collections, study packs, quizzes
14. `mobile/App.js` — Register new screens in `StudyNavigator`.

## Implementation Details

### Add (+) flow (bottom sheet)
- Study home shows a floating circular button (Ionicons `add`) always visible.
- Tapping opens `AddBottomSheet` (slide-up modal):
  - **Cards** (icon: layers/cards) → expands/navigates to Cards menu
  - **Notes** (icon: document-text) → expands/navigates to Notes menu
- Cards menu options:
  - ✨ **Magic Import** → `CardImportScreen`
  - ✍️ **Write Your Own** → `FlashcardCollectionsScreen` or directly `FlashcardEditScreen`
- Notes menu options:
  - ✨ **Magic Import** → `NoteImportScreen`
  - ✍️ **Write Your Own** → `NoteEditScreen`

### Magic Import (Cards)
- Reuse/extend existing `/flashcards/magic-import` backend.
- New `CardImportScreen`:
  - Choose source: **Upload PDF**, **Paste notes**, **Type a topic**
  - AI generates flashcards → preview list (front/back) with review
  - Save into a chosen/created collection
  - Loading spinner + success/error messages

### Magic Import (Notes)
- New `NoteImportScreen`:
  - Choose source: **Upload PDF**, **Paste notes**, **Type a topic**
  - AI generates structured note (summary, key concepts, important terms, study tips, learning objectives)
  - Preview → save as a StudyNote
  - Loading spinner + success/error messages

### Write Your Own (Notes)
- New `NoteEditScreen` with `RichTextEditor`:
  - Toolbar: H1/H2, Bold, Italic, Underline, Bullet list, Numbered list, Checklist
  - Save as structured content JSON to backend
  - Edit/delete existing notes

### Write Your Own (Cards)
- Reuse existing `FlashcardCollectionsScreen` / `FlashcardEditScreen` flows.
- Collections = decks; cards can be organized into decks.

## UI/UX
- Theme-aware (light/dark/system) via `useTheme()`.
- Rounded cards, consistent spacing, Ionicons icons.
- Smooth animations (Animated API): bottom-sheet slide, backdrop fade, list stagger, FAB press scale.
- Loading indicators during AI generation.
- Clear success (Alert / inline) and error messages.
- Responsive layout (useWindowDimensions for wide screens).

## Database Schema Addition
```prisma
model StudyNote {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  title       String
  contentJson Json     // rich text blocks [{type:"heading",level,text}, {type:"text",text,marks:[...]}, {type:"list",...}, {type:"checklist",items:[...]}]
  source      String   // "ai" | "manual"
  aiSummary       String?  @db.Text
  aiKeyConcepts   Json?
  aiImportantTerms Json?
  aiStudyTips     Json?
  aiLearningObjectives Json?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([userId])
}
```

## Backend API (notes)
- `GET /api/notes` — list user notes
- `POST /api/notes` — create note (manual or AI-sourced)
- `GET /api/notes/:id` — fetch one
- `PATCH /api/notes/:id` — update title/content
- `DELETE /api/notes/:id` — delete
- `POST /api/notes/magic-import` — AI generate from topic/notes/PDF → returns structured note (no save until user confirms)

## Follow-up Steps
1. Run `npx prisma migrate dev --name add_study_notes` in `backend/`
2. Run `npx prisma generate`
3. Restart backend server
4. Test mobile flows in Expo

## Dependencies
- No new npm packages needed (uses existing React Native Animated, Modal, @expo/vector-icons).

