# FocusFlow — React Native + Node.js + PostgreSQL

This is the converted, real-stack version of the FocusFlow prototype:
**React Native (Expo)** frontend, **Node.js/Express** backend, **PostgreSQL** database via **Prisma**.

```
focusflow-project/
  backend/     Node.js + Express + Prisma API
  mobile/      React Native app (Expo)
```

One login screen, role-based routing (student / admin) — same
behavior as the web prototype: a student or admin account logs in
through the identical screen, and the app silently routes to the right
experience based on the account's role.

---

## What's fully implemented vs. scaffolded

**Backend — fully implemented:**
- Auth (signup/login/JWT), role-based access control middleware
- Tasks CRUD, Subjects CRUD with archive/restore/permanent-delete
- Pomodoro session logging + aggregated stats endpoint
- AI study-pack generation (summary/flashcards/quiz) and AI coach insight via Anthropic API
- Quiz editing, publishing, assigning, and server-side-scored attempts
- Admin routes (user management, activity logs, analytics, system settings)

**Mobile — fully implemented:**
- Auth (login/signup), session persistence
- Timer (full Pomodoro logic, logs sessions to the backend, local notifications)
- Tasks (full CRUD against the backend)
- Stats (aggregated stats + a 7-day chart)
- Settings (profile fields, logout)

**Mobile — starter/scaffolded, not full parity with the web version:**
- `AdminHomeScreen.js` proves the pattern (real data from the backend) but
  doesn't yet cover materials/quiz management, activity logs, or user
  management UI. The backend routes for all of that already exist
  (`/api/admin/users`, `/api/admin/logs`, etc.) — follow the same
  Screen/Card/FlatList pattern used in `TasksScreen.js` to build those out.
- AI Coach and AI Study Tools (flashcards/quiz generation) have working
  backend routes (`POST /api/materials/generate`, `POST /api/materials/coach`)
  but no dedicated mobile screen yet — same pattern applies.
- Archive UI for subjects isn't built in the mobile app yet, though the
  backend routes are ready (`POST /api/subjects/:id/archive`, etc.).

Given the scope of the original project, building every screen to full
parity in one pass wasn't realistic — this gives you a solid, working
foundation with the hardest architectural decisions (auth, role routing,
data model, AI integration) already made and tested.

---

## Prerequisites

- [Node.js](https://nodejs.org) 18+ and npm
- [PostgreSQL](https://www.postgresql.org/download/) running locally (or a hosted instance)
- [VS Code](https://code.visualstudio.com/) with the **ESLint** and **Prisma** extensions (optional but helpful)
- [Expo Go](https://expo.dev/go) app on your phone, or an iOS/Android simulator, for running the mobile app
- An [Anthropic API key](https://console.anthropic.com/) for the AI features

---

## 1. Backend setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:
- `DATABASE_URL` — your PostgreSQL connection string
- `JWT_SECRET` — any long random string
- `ANTHROPIC_API_KEY` — your API key

Create the database and run migrations:

```bash
npx prisma migrate dev --name init
```

Seed demo accounts (admin/student):

```bash
npm run seed
```

Start the API:

```bash
npm run dev
```

You should see `FocusFlow API listening on http://localhost:4000`.
Verify with `curl http://localhost:4000/health`.

**Demo credentials after seeding:**
| Role | Email | Password |
|---|---|---|
| Admin | admin@school.edu | Admin@123 |
| Student | student1@school.edu | Demo@123 |

---

## 2. Mobile setup

```bash
cd mobile
npm install
```

Open `src/api/client.js` and check `API_BASE_URL`:
- **iOS simulator**: `http://localhost:4000/api` (default) works as-is.
- **Android emulator**: `http://10.0.2.2:4000/api` (default) works as-is.
- **Physical phone via Expo Go**: replace with your computer's LAN IP,
  e.g. `http://192.168.1.23:4000/api` — your phone and computer must be
  on the same Wi-Fi network. Find your IP with `ipconfig` (Windows) or
  `ifconfig`/`ipconfig getifaddr en0` (Mac).

Start Expo:

```bash
npx expo start
```

This opens the Expo dev tools in your terminal/browser. From there:
- Press `i` for iOS simulator, `a` for Android emulator
- Or scan the QR code with the Expo Go app on your phone

---

## 3. Developing in VS Code

Open the whole `focusflow-project` folder as your VS Code workspace so
both `backend` and `mobile` are visible side by side. Recommended setup:

- Two integrated terminals: one running `npm run dev` in `backend/`, one
  running `npx expo start` in `mobile/`
- Install the **Prisma** VS Code extension for schema syntax highlighting
  and formatting
- `npx prisma studio` (from `backend/`) opens a browser-based database
  browser — handy for inspecting data while you develop

---

## 4. Database schema changes

Whenever you edit `backend/prisma/schema.prisma`:

```bash
cd backend
npx prisma migrate dev --name describe_your_change
```

This updates both the database and the generated Prisma client types.

---

## 5. Known gaps / next steps

- **File upload for PDF/PPTX/DOCX**: the backend's `POST /api/materials/generate`
  route accepts already-extracted `rawText`, not a raw file. Wire in a
  parsing step (e.g. `pdf-parse`, `mammoth` for docx) before calling that
  route if you want real file uploads instead of pasted text.
- **Push notifications**: the mobile app uses local notifications
  (`expo-notifications` scheduled with `trigger: null`, i.e. immediate).
  For real background/scheduled reminders, you'll want Expo's push
  notification service and a server-side scheduler.
- **Offline support**: session logging currently fails silently if the
  device is offline mid-timer. A production build should queue failed
  requests locally (e.g. with AsyncStorage) and retry on reconnect.
- **Admin mobile screens**: see the "scaffolded" section above.
