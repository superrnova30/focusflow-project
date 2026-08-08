# Calendar & Progress Tracking Feature — Implementation Steps

## Backend
- [ ] 1. Extend `backend/src/lib/gamification.js` with a `computeCalendar` helper that aggregates per-day study activity (focus minutes, quiz attempts, XP, correct/wrong answers).
- [ ] 2. Add `GET /api/game/progress` endpoint in `backend/src/routes/game.js` returning level, xp, hearts, streak, and calendar day data.
- [ ] 3. Wire XP awarding + correct/wrong counters and activity logging into `backend/src/routes/quizzes.js` (regular quiz attempts) so they feed the dashboard automatically.

## Frontend
- [ ] 4. Create `mobile/src/components/Calendar.js` — reusable, themed, navigable monthly calendar grid with per-day activity badges and selected-day detail.
- [ ] 5. Create `mobile/src/screens/ProgressScreen.js` — student progress dashboard (hearts, XP + level progress bar, streak summary, calendar).
- [ ] 6. Register `ProgressScreen` in `mobile/App.js` StudyNavigator.
- [ ] 7. Make the XP + hearts status bar in `mobile/src/screens/StudyHomeScreen.js` tappable to open the Progress dashboard.

## Verification
- [ ] 8. Restart backend, verify `/api/game/progress` and quiz XP wiring.
- [ ] 9. Verify calendar renders in light/dark themes and is responsive.
