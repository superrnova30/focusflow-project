import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Modal, Switch, Image, Alert } from "react-native";
import Constants from "expo-constants";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { loadAlarmPrefs, getAlarmSound, saveAlarmPrefs, ALARM_SOUNDS } from "../lib/alarmPrefs";
import { playAlarm, stopAlarm, previewAlarm } from "../lib/alarmPlayer";
import { useNavigation } from "@react-navigation/native";
import client, { queueRequest } from "../api/client";

const fmtClock = (secs) => {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const isExpoGo = Constants.appOwnership === "expo";

export default function TimerScreen() {
  const { colors } = useTheme();
  const styles = useStyles(colors);

  const MODES = {
    focus: { label: "Focus", color: colors.tomato },
    short: { label: "Short Break", color: colors.mint },
    long: { label: "Long Break", color: colors.mint },
  };

  const [NotificationsModule, setNotificationsModule] = useState(null);

  useEffect(() => {
    if (!isExpoGo) {
      import("expo-notifications")
        .then((module) => {
          setNotificationsModule(module);
          module.setNotificationHandler({
            handleNotification: async () => ({ shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: false }),
          });
        })
        .catch(() => {});
    }
  }, []);

  const { user, refreshUser } = useAuth();
  const durations = {
    focus: user?.focusMinutes ?? 25,
    short: user?.shortBreakMinutes ?? 5,
    long: user?.longBreakMinutes ?? 15,
  };
  const sessionsBeforeLongBreak = user?.sessionsBeforeLongBreak ?? 4;

  const [mode, setMode] = useState("focus");
  const [secondsLeft, setSecondsLeft] = useState(durations.focus * 60);
  const [running, setRunning] = useState(false);
  const [cyclesDone, setCyclesDone] = useState(0);
  const [tasks, setTasks] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [activeSubjectId, setActiveSubjectId] = useState(null);
  const [alarmVisible, setAlarmVisible] = useState(false);
  const [alarmPrefs, setAlarmPrefs] = useState({ enabled: true, soundId: "chime", volume: 0.8 });
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [editFocus, setEditFocus] = useState(String(user?.focusMinutes ?? 25));
  const [editShort, setEditShort] = useState(String(user?.shortBreakMinutes ?? 5));
  const [editLong, setEditLong] = useState(String(user?.longBreakMinutes ?? 15));
  const [editSessionsBeforeLong, setEditSessionsBeforeLong] = useState(String(user?.sessionsBeforeLongBreak ?? 4));
  const [editAlarmEnabled, setEditAlarmEnabled] = useState(true);
  const [editAlarmSoundId, setEditAlarmSoundId] = useState("chime");
  const [editAlarmVolume, setEditAlarmVolume] = useState(0.8);

  const intervalRef = useRef(null);

useEffect(() => {
    if (NotificationsModule) {
      NotificationsModule.requestPermissionsAsync().catch(() => {});
    }
    loadAlarmPrefs().then((p)=>{ setAlarmPrefs(p); }).catch(() => {});
  }, [NotificationsModule]);

  const navigation = useNavigation();
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <Pressable onPress={() => setSettingsVisible(true)} style={{ padding: 8 }}>
          <Text style={{ fontSize: 20 }}>⚙️</Text>
        </Pressable>
      ),
    });
  }, [navigation]);

  // Refetch tasks AND subjects whenever the screen gains focus so newly
  // added/deleted subjects and tasks from the Tasks / Study tabs appear
  // immediately — no manual refresh or app restart required.
  useFocusEffect(
    useCallback(() => {
      fetchTasks();
      fetchSubjects();
    }, [])
  );

  const fetchTasks = async () => {
    try {
      const { data } = await client.get("/tasks");
      const open = data.tasks.filter((t) => !t.completed);
      setTasks(open);
      // Clear a stale selected task if it was deleted or completed.
      setActiveTaskId((current) =>
        current && !open.some((t) => t.id === current) ? null : current
      );
    } catch (e) {
      // Non-fatal — timer still works without task assignment
    }
  };

  const fetchSubjects = async () => {
    try {
      const { data } = await client.get("/subjects");
      // Filter out the legacy "Data Structures" subject so it does not
      // appear in the Timer section UI.
      const filtered = data.subjects.filter(
        (s) => (s.name || "").toLowerCase().trim() !== "data structures"
      );
      setSubjects(filtered);
      // Clear a stale selected subject if it was archived, deleted, or filtered out.
      setActiveSubjectId((current) =>
        current && !filtered.some((s) => s.id === current) ? null : current
      );
    } catch (e) {
      // Non-fatal
    }
  };

  const durationFor = useCallback((m) => durations[m], [user]);

  // When a subject is selected, only show tasks assigned to that subject.
  // Otherwise show all open tasks so every task is reachable.
  const visibleTasks = useMemo(() => {
    if (!activeSubjectId) return tasks;
    return tasks.filter((t) => t.subjectId === activeSubjectId);
  }, [tasks, activeSubjectId]);

  const dismissAlarm = useCallback(() => {
    setAlarmVisible(false);
    stopAlarm();
  }, []);

  // When opening settings modal, initialize editable state from user + stored prefs
  useEffect(() => {
    if (settingsVisible) {
      setEditFocus(String(user?.focusMinutes ?? 25));
      setEditShort(String(user?.shortBreakMinutes ?? 5));
      setEditLong(String(user?.longBreakMinutes ?? 15));
      setEditSessionsBeforeLong(String(user?.sessionsBeforeLongBreak ?? 4));
      loadAlarmPrefs().then((p) => {
        setEditAlarmEnabled(p.enabled);
        setEditAlarmSoundId(p.soundId);
        setEditAlarmVolume(p.volume);
      }).catch(()=>{});
    }
  }, [settingsVisible, user]);

  const saveTimerSettings = async () => {
    try {
      await client.patch('/auth/me', {
        focusMinutes: Number(editFocus) || 25,
        shortBreakMinutes: Number(editShort) || 5,
        longBreakMinutes: Number(editLong) || 15,
        sessionsBeforeLongBreak: Number(editSessionsBeforeLong) || 4,
      });
      await saveAlarmPrefs({ enabled: editAlarmEnabled, soundId: editAlarmSoundId, volume: editAlarmVolume });
      setAlarmPrefs({ enabled: editAlarmEnabled, soundId: editAlarmSoundId, volume: editAlarmVolume });
      await refreshUser();
      // update timer durations in-place
      setSecondsLeft(durationFor(mode) * 60);
      setSettingsVisible(false);
    } catch (e) {
      Alert.alert('Error', e.message);
    }
  };

  const handleSessionComplete = useCallback(async () => {
    setRunning(false);

    // Play the alarm sound + show popup when a focus session completes.
    if (mode === "focus" && alarmPrefs.enabled) {
      try {
        await playAlarm(alarmPrefs.soundId, alarmPrefs.volume);
        setAlarmVisible(true);
      } catch (e) {
        // alarm playback is non-fatal
      }
    }

    if (NotificationsModule) {
      try {
        await NotificationsModule.scheduleNotificationAsync({
          content: {
            title: mode === "focus" ? "Focus session complete" : "Break's over",
            body: mode === "focus" ? "Nice work. Time for a break." : "Let's start the next focus block.",
          },
          trigger: null,
        });
      } catch (e) {}
    }

try {
      await client.post("/sessions", {
        type: mode,
        minutes: durationFor(mode),
        taskId: mode === "focus" ? activeTaskId : null,
        subjectId: activeSubjectId,
      });
    } catch (e) {
      // If this fails (e.g. offline), queue the session so it gets replayed
      // once connectivity returns instead of being silently dropped.
      await queueRequest("POST", "/sessions", {
        type: mode,
        minutes: durationFor(mode),
        taskId: mode === "focus" ? activeTaskId : null,
        subjectId: activeSubjectId,
      });
    }

    if (mode === "focus") {
      const nextCycles = cyclesDone + 1;
      setCyclesDone(nextCycles);
      const nextMode = nextCycles % sessionsBeforeLongBreak === 0 ? "long" : "short";
      setMode(nextMode);
      setSecondsLeft(durationFor(nextMode) * 60);
    } else {
      setMode("focus");
      setSecondsLeft(durationFor("focus") * 60);
    }
  }, [mode, activeTaskId, cyclesDone, durationFor, sessionsBeforeLongBreak, alarmPrefs]);

  const completeRef = useRef(handleSessionComplete);
  useEffect(() => {
    completeRef.current = handleSessionComplete;
  }, [handleSessionComplete]);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSecondsLeft((prev) => {
          if (prev <= 1) {
            completeRef.current();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => intervalRef.current && clearInterval(intervalRef.current);
  }, [running]);

  const switchMode = (m) => {
    setRunning(false);
    setMode(m);
    setSecondsLeft(durationFor(m) * 60);
  };

  const modeColor = MODES[mode].color;
  const alarmSound = getAlarmSound(alarmPrefs.soundId);

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 16, paddingBottom: 40 }}>
        <View style={styles.greetingRow}>
          <Image source={require("../theme/logo.png")} style={styles.logo} />
          <View style={styles.greetingTextWrap}>
            <Text style={styles.greeting}>Hi, {user?.name?.split(" ")[0] || "there"}</Text>
            <View style={styles.greetingPill}>
              <Text style={styles.greetingPillText}>Student</Text>
            </View>
          </View>
        </View>

        <View style={styles.modeRow}>
          {Object.entries(MODES).map(([key, meta]) => (
            <Pressable
              key={key}
              onPress={() => switchMode(key)}
              style={[styles.modeButton, mode === key && { backgroundColor: meta.color }]}
            >
              <Text style={[styles.modeButtonText, mode === key && { color: "#fff" }]}>{meta.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.clockWrap}>
          <View style={[styles.clockRing, { borderColor: modeColor }]}>
            <Text style={styles.clockText}>{fmtClock(secondsLeft)}</Text>
            <Text style={styles.clockLabel}>{MODES[mode].label.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.controlsRow}>
          <Pressable
            style={styles.resetButton}
            onPress={() => { setRunning(false); setSecondsLeft(durationFor(mode) * 60); }}
          >
            <Text style={styles.controlText}>Reset</Text>
          </Pressable>
          <Pressable
            style={[styles.playButton, { backgroundColor: modeColor }]}
            onPress={() => setRunning((r) => !r)}
          >
            <Text style={styles.playButtonText}>{running ? "Pause" : "Start"}</Text>
          </Pressable>
          <View style={styles.cycleBadge}>
            <Text style={styles.cycleText}>{cyclesDone % sessionsBeforeLongBreak}/{sessionsBeforeLongBreak}</Text>
          </View>
        </View>

{subjects.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>SUBJECT</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
              {subjects.map((s) => {
                const selected = activeSubjectId === s.id;
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => setActiveSubjectId(selected ? null : s.id)}
                    style={[styles.taskChip, selected && { borderColor: colors.violet, backgroundColor: colors.violetSoft }]}
                  >
                    <Text style={[styles.taskChipText, selected && { color: colors.violet }]}>{s.name}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}

        <Text style={[styles.sectionLabel, { marginTop: subjects.length > 0 ? 4 : 0 }]}>WORKING ON</Text>
        {visibleTasks.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.mutedText}>
              {activeSubjectId
                ? "No open tasks for this subject — add one in the Tasks tab."
                : "No open tasks — add one in the Tasks tab."}
            </Text>
          </Card>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {visibleTasks.map((t) => (
              <Pressable
                key={t.id}
                onPress={() => setActiveTaskId(t.id === activeTaskId ? null : t.id)}
                style={[
                  styles.taskChip,
                  t.id === activeTaskId && { borderColor: colors.tomato, backgroundColor: colors.tomatoSoft },
                ]}
              >
                <Text style={[styles.taskChipText, t.id === activeTaskId && { color: colors.tomato }]}>{t.title}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </ScrollView>

      <Modal
        transparent
        visible={alarmVisible}
        animationType="fade"
        onRequestClose={dismissAlarm}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>⏰ Time's up!</Text>
            <Text style={styles.modalBody}>
              {mode === "focus" ? "Focus session complete. Nice work!" : "Break's over — let's keep going."}
            </Text>
            <Text style={styles.modalSound}>Alarm: {alarmSound.label}</Text>
            <Pressable style={styles.modalButton} onPress={dismissAlarm}>
              <Text style={styles.modalButtonText}>Stop</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={settingsVisible}
        animationType="slide"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <Screen>
          <ScrollView contentContainerStyle={{ padding: 18 }}>
            <Text style={[styles.modalTitle, { marginBottom: 6 }]}>Timer Settings</Text>
            <Text style={styles.modalBody}>Manage Pomodoro durations and alarm preferences.</Text>

            <Card style={{ marginTop: 12 }}>
              <Text style={styles.cardTitle || styles.modalSound}>Pomodoro</Text>
              <Input value={editFocus} onChangeText={setEditFocus} placeholder="Focus minutes" keyboardType="number-pad" />
              <View style={{ height: 8 }} />
              <Input value={editShort} onChangeText={setEditShort} placeholder="Short break minutes" keyboardType="number-pad" />
              <View style={{ height: 8 }} />
              <Input value={editLong} onChangeText={setEditLong} placeholder="Long break minutes" keyboardType="number-pad" />
              <View style={{ height: 8 }} />
              <Input value={editSessionsBeforeLong} onChangeText={setEditSessionsBeforeLong} placeholder="Sessions before long break" keyboardType="number-pad" />
            </Card>

            <Card style={{ marginTop: 12 }}>
              <Text style={styles.cardTitle || styles.modalSound}>Alarm</Text>
              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Play alarm when focus ends</Text>
                <Switch value={editAlarmEnabled} onValueChange={setEditAlarmEnabled} trackColor={{ true: colors.tomato }} />
              </View>

              <Text style={styles.subLabel}>Sound</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                {ALARM_SOUNDS.map((s) => {
                  const sel = editAlarmSoundId === s.id;
                  return (
                    <Pressable key={s.id} onPress={() => { setEditAlarmSoundId(s.id); previewAlarm(s.id, editAlarmVolume); }} style={[{
                      paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, marginRight: 8, marginBottom: 8
                    }, sel ? { borderColor: colors.tomato, backgroundColor: colors.tomatoSoft } : { borderColor: colors.border, backgroundColor: colors.surface }] }>
                      <Text style={{ color: sel ? colors.tomato : colors.textMuted, fontWeight: '700' }}>{s.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.subLabel}>Volume</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Pressable onPress={() => setEditAlarmVolume((v) => Math.max(0, Math.round((v - 0.1) * 10) / 10))} style={styles.volumeBtn}><Text style={styles.volumeBtnText}>−</Text></Pressable>
                <View style={{ flex: 1, height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{ width: `${editAlarmVolume * 100}%`, height: '100%', backgroundColor: colors.tomato }} />
                </View>
                <Pressable onPress={() => setEditAlarmVolume((v) => Math.min(1, Math.round((v + 0.1) * 10) / 10))} style={styles.volumeBtn}><Text style={styles.volumeBtnText}>+</Text></Pressable>
                <Text style={styles.volumePct}>{Math.round(editAlarmVolume * 100)}%</Text>
              </View>
            </Card>

            <View style={{ marginTop: 18, flexDirection: 'row', gap: 10 }}>
              <Button title="Save" onPress={saveTimerSettings} />
              <Button title="Cancel" onPress={() => setSettingsVisible(false)} variant="secondary" />
            </View>
          </ScrollView>
        </Screen>
      </Modal>
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    greeting: { color: colors.text, fontSize: 20, fontWeight: "800", marginBottom: 0 },
    greetingRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    greetingTextWrap: { flexDirection: 'row', alignItems: 'center' },
      logo: { width: 48, height: 48, marginRight: 14, borderRadius: 10 },
      greetingPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, marginLeft: 8 },
      greetingPillText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    modeRow: { flexDirection: "row", backgroundColor: colors.surface, borderRadius: 14, padding: 4, marginBottom: 24 },
    modeButton: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center" },
    modeButtonText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
    clockWrap: { alignItems: "center", marginBottom: 24 },
    clockRing: {
      width: 240, height: 240, borderRadius: 120, borderWidth: 10,
      alignItems: "center", justifyContent: "center", backgroundColor: colors.surface,
    },
    clockText: { color: colors.text, fontSize: 44, fontWeight: "700", fontVariant: ["tabular-nums"] },
    clockLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginTop: 6, letterSpacing: 1 },
    controlsRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 28 },
    resetButton: {
      width: 54, height: 54, borderRadius: 27, borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.surface, alignItems: "center", justifyContent: "center",
    },
    controlText: { color: colors.text, fontSize: 11, fontWeight: "700" },
    playButton: { width: 78, height: 78, borderRadius: 39, alignItems: "center", justifyContent: "center" },
    playButtonText: { color: "#fff", fontWeight: "700", fontSize: 14 },
    cycleBadge: {
      width: 54, height: 54, borderRadius: 27, borderWidth: 1, borderColor: colors.border,
      backgroundColor: colors.surface, alignItems: "center", justifyContent: "center",
    },
    cycleText: { color: colors.textMuted, fontWeight: "700", fontSize: 12 },
sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "700", marginBottom: 8 },
    mutedText: { color: colors.textMuted, fontSize: 13 },
    chipRow: { marginBottom: 8 },
    emptyCard: { marginTop: 0 },
    taskChip: {
      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1,
      borderColor: colors.border, backgroundColor: colors.surface, marginRight: 8,
    },
    taskChipText: { color: colors.text, fontSize: 12, fontWeight: "600" },
    modalOverlay: {
      flex: 1, backgroundColor: "rgba(0,0,0,0.6)",
      alignItems: "center", justifyContent: "center", padding: 32,
    },
    modalCard: {
      backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1,
      borderRadius: 20, padding: 28, alignItems: "center", width: "100%",
    },
    modalTitle: { color: colors.text, fontSize: 24, fontWeight: "800", marginBottom: 8 },
    modalBody: { color: colors.textMuted, fontSize: 15, textAlign: "center", marginBottom: 8 },
    modalSound: { color: colors.textMuted, fontSize: 12, marginBottom: 20 },
    modalButton: {
      backgroundColor: colors.tomato, borderRadius: 12,
      paddingVertical: 12, paddingHorizontal: 48, alignItems: "center", justifyContent: "center",
    },
    modalButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  });
