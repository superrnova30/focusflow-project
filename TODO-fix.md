# Fix: Expo Go "Something went wrong" crash (expo-av deprecated in SDK 54)

## Plan
- [x] 1. Install `expo-audio` (bundled replacement) in `mobile/`
- [x] 2. Rewrite `mobile/src/lib/alarmPlayer.js` to use `expo-audio` instead of `expo-av`
- [x] 3. Remove `expo-av` from `mobile/package.json`
- [x] 4. Prune `expo-av` and verify no references remain
- [x] 5. Re-bundle to confirm clean compile
