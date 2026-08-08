import { createAudioPlayer, setAudioModeAsync } from "expo-audio";
import { getAlarmSound } from "./alarmPrefs";

const MAX_ALARM_MS = 3 * 60 * 1000; // 3 minutes

let player = null;
let stopTimer = null;

/**
 * Plays the chosen alarm sound, looping until manually stopped or
 * the 3-minute cap is reached. Volume is applied on each play.
 * Returns a promise that resolves once playback actually starts.
 */
export async function playAlarm(soundId, volume) {
  await stopAlarm(); // ensure no old sound is running
  const sound = getAlarmSound(soundId);
  if (!sound) return;

  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "duckOthers",
    });

    // expo-audio's createAudioPlayer accepts a require()'d asset directly.
    player = createAudioPlayer(sound.source, {
      keepAudioSessionActive: true,
    });
    player.loop = true;
    player.volume = Math.max(0, Math.min(1, volume));
    player.play();

    // Auto-stop after 3 minutes.
    stopTimer = setTimeout(() => {
      stopAlarm();
    }, MAX_ALARM_MS);
  } catch (e) {
    // Audio may fail in Expo Go / emulator edge cases — non-fatal.
    player = null;
  }
}

/** Stops and unloads the currently playing alarm. */
export async function stopAlarm() {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  if (player) {
    try {
      player.pause();
      player.remove();
    } catch (e) {
      // ignore
    }
    player = null;
  }
}

/** Preview a sound at a given volume — plays once, does not loop. */
export async function previewAlarm(soundId, volume) {
  await stopAlarm();
  const sound = getAlarmSound(soundId);
  if (!sound) return;

  try {
    player = createAudioPlayer(sound.source, {
      keepAudioSessionActive: true,
    });
    player.loop = false;
    player.volume = Math.max(0, Math.min(1, volume));
    player.play();

    // Unload shortly after it finishes.
    const duration = (player.duration > 0 ? player.duration * 1000 : 1200) + 300;
    stopTimer = setTimeout(() => stopAlarm(), duration);
  } catch (e) {
    player = null;
  }
}

