# Feature Pack UI Completion — Plan Tracking

## Goal
Finish the remaining mobile-side items from `TODO-4-features.md`: offline queue wiring for the timer, daily challenge + streak + level on the Study Home screen, a dedicated Leaderboard screen with a trophy entry point, and gamification refresh wiring.

## Steps
- [x] 1. Add explicit offline queue helper in `mobile/src/api/client.js` (export `queueRequest`).
- [x] 2. Update `TimerScreen.js` to use the offline queue for session logging so sessions aren't silently dropped.
- [x] 3. Create `mobile/src/screens/LeaderboardScreen.js` — themed leaderboard (top list + my rank), registered in App.js.
- [x] 4. Update `StudyHomeScreen.js` — add Daily Challenge card (progress + Complete), streak + level badges, and a dedicated trophy button to open the Leaderboard.
- [x] 5. Update `App.js` — register the `Leaderboard` screen in `StudyNavigator`.
- [x] 6. Gamification refresh wiring — handled in `StudyHomeScreen.js` via focus-driven `fetchGameState()`, `fetchStreakLevel()`, and `fetchChallenge()` (refresh XP/hearts/streak/level/challenge on every screen focus; daily challenge completion also re-fetches XP + streak).
- [x] 7. Backend migration `20260810000000_add_push_and_gamification_polish` exists and schema is in sync (`User` streak/level fields, `DeviceToken`, `DailyChallenge`, `DailyChallengeCompletion`).
