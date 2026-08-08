# Feature Pack: PPTX/DOCX Upload + Push Notifications + Offline Support + Gamification Polish

## 1. PPTX/DOCX Upload Support
- [x] Backend: add `mammoth` (docx) + `officeparser` (pptx) dependencies
- [x] Backend: add `parseDocx()` and `parsePptx()` helpers in `materials.js`
- [x] Backend: extend `upload-pdf` → generic `upload-document` (accept pdf/docx/pptx), keep backward-compatible alias
- [x] Mobile: update `CardImportScreen.js` picker to accept .docx/.pptx/.pdf
- [x] Mobile: update `NoteImportScreen.js` picker to accept .docx/.pptx/.pdf

## 2. Push Notifications
- [x] Backend: add `DeviceToken` model + migration SQL
- [x] Backend: create `src/routes/push.js` — `POST /api/push/register`, `POST /api/push/unregister`, `POST /api/push/send-test`
- [x] Backend: create `src/lib/reminders.js` — daily reminder scheduler via Expo push API
- [x] Backend: mount `/api/push` in `index.js`, wire reminders
- [x] Mobile: register Expo push token on login/save (Settings)
- [x] Mobile: push toggle + test button in `SettingsScreen.js`

## 3. Offline Support
- [x] Mobile: request queue in `client.js` using AsyncStorage (store failed requests, retry on reconnect)
- [x] Mobile: flush queue on app focus / connectivity restored
- [x] Mobile: `TimerScreen.js` session logging uses queue so it no longer silently drops

## 4. Gamification Polish
- [x] Backend: schema — add streak fields to User (`streakCount`, `longestStreak`, `lastActiveDate`, `currentLevel`, `challengesCompleted`) + `DailyChallenge` model
- [x] Backend: migration SQL for gamification polish
- [x] Backend: update `game.js` — `GET /api/game/streak`, `GET /api/game/leaderboard`, `GET /api/game/challenges`, `POST /api/game/challenges/:id/complete`, XP levels
- [x] Backend: bump streak on login/session in `auth.js`/`sessions.js`
- [x] Mobile: StudyHome shows streak + level + daily challenge card
- [x] Mobile: new leaderboard screen (registered in `App.js`)
- [x] Mobile: wire gamification refresh in AuthContext/StudyHome

## Follow-up
- [ ] Run `npx prisma migrate dev` + `npx prisma generate` in `backend/`
- [ ] Restart backend, verify routes
- [ ] Verify mobile bundle (`expo export`)

