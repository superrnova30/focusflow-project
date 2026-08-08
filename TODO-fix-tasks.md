# Fix Tasks: Timer Sync + UI Polish

## Steps

- [x] 1. Fix shared `Input` component so callers' `style` prop merges with base styles (fixes borderless "New task..."/"New subject..." fields).
- [x] 2. Fix `TimerScreen.js` to refetch subjects on focus (alongside tasks) and clear stale selected subject/task ids.
- [x] 3. Polish `TasksScreen.js` (bordered input, delete/toggle error handling, consistent layout).
- [x] 4. Polish `SubjectsScreen.js` (add-row alignment, action button styling).
- [x] 5. Verify all CRUD flows reflect immediately in the Timer without manual refresh.
