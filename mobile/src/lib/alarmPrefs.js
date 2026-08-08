import AsyncStorage from "@react-native-async-storage/async-storage";

export const ALARM_SOUNDS = [
  { id: "beep", label: "Beep", source: require("../../assets/alarms/beep.wav") },
  { id: "chime", label: "Chime", source: require("../../assets/alarms/chime.wav") },
  { id: "marimba", label: "Marimba", source: require("../../assets/alarms/marimba.wav") },
  { id: "digital", label: "Digital", source: require("../../assets/alarms/digital.wav") },
];

export const DEFAULT_ALARM_PREFS = {
  enabled: true,
  soundId: "chime",
  volume: 0.8,
};

const KEYS = {
  enabled: "focusflow_alarm_enabled",
  soundId: "focusflow_alarm_sound",
  volume: "focusflow_alarm_volume",
};

export async function loadAlarmPrefs() {
  try {
    const [enabled, soundId, volume] = await Promise.all([
      AsyncStorage.getItem(KEYS.enabled),
      AsyncStorage.getItem(KEYS.soundId),
      AsyncStorage.getItem(KEYS.volume),
    ]);
    return {
      enabled: enabled === null ? DEFAULT_ALARM_PREFS.enabled : enabled === "true",
      soundId: soundId || DEFAULT_ALARM_PREFS.soundId,
      volume: volume === null ? DEFAULT_ALARM_PREFS.volume : Number(volume),
    };
  } catch (e) {
    return { ...DEFAULT_ALARM_PREFS };
  }
}

export async function saveAlarmPrefs(prefs) {
  try {
    await Promise.all([
      AsyncStorage.setItem(KEYS.enabled, prefs.enabled ? "true" : "false"),
      AsyncStorage.setItem(KEYS.soundId, prefs.soundId),
      AsyncStorage.setItem(KEYS.volume, String(prefs.volume)),
    ]);
  } catch (e) {
    // non-fatal
  }
}

export function getAlarmSound(id) {
  return ALARM_SOUNDS.find((s) => s.id === id) || ALARM_SOUNDS[0];
}
