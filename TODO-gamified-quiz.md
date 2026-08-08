# Gamified Quiz + "I want to study..." Generator — Plan

## Goal
1. Restore the **"I want to study..."** AI generator text input on the Study home page (Generate button + PDF upload / paste-notes options).
2. Add a **gamified quiz experience**: XP (+200/correct), Hearts (5 lives), immediate per-question feedback, "Quiz Over" screen with retry/generate options, animated XP/Hearts status bar.

## Backend Steps
- [x] 1. Update `prisma/schema.prisma` — Add `xp`, `hearts`, `correctAnswers`, `wrongAnswers`, `totalXpEarned` to `User`. Create migration.
- [x] 2. Create `src/routes/game.js` — `GET /api/game/state`, `POST /api/game/xp`, `POST /api/game/hearts`, `POST /api/game/quiz` (AI 4-option MC quiz from topic/notes).
- [x] 3. Update `src/lib/ai.js` — Add `generateQuiz(topic, notes)` returning pure 4-option MC questions.
- [x] 4. Update `src/index.js` — Mount `/api/game` route.
- [x] 5. Verify `publicUser` exposes `xp`/`hearts`.

## Mobile Steps
- [x] 6. Create `src/screens/GamifiedQuizScreen.js` — status bar (XP/Hearts), one-question-at-a-time MC, instant feedback, +200 XP / -1 heart, Quiz Over screen, animations, theme-aware.
- [x] 7. Update `src/screens/StudyHomeScreen.js` — Add "I want to study..." input + Generate button + PDF/paste-notes shortcuts; add XP/Hearts status bar; wire to gamified quiz.
- [x] 8. Update `App.js` — Register `GamifiedQuiz` screen in `StudyNavigator`.
- [x] 9. Update `AuthContext` / client usage so XP/hearts refresh on focus.

## Follow-up
- [x] 10. Run `npx prisma migrate dev --name add_gamification` + `npx prisma generate`
- [x] 11. Restart backend, verify `/api/game` works
- [x] 12. Verify mobile bundle (`expo export`)

## Verification Results
- Prisma migration `20260809000000_add_gamification` applied; DB in sync (7 migrations total).
- Backend starts cleanly on port 4100; `/api/game` route mounted.
- End-to-end API test passed: login exposes xp=0/hearts=5; `GET /api/game/state` returns correct values; `POST /api/game/xp` +200 persists; `POST /api/game/hearts` -1 persists; `set:5` restores.
- `POST /api/game/quiz` returns 4 questions × 4 options, topic preserved, answerKey parallel array, no answer leaked in questions.
- Mobile `expo export --platform android` bundled cleanly (Hermes `.hbc` produced).

