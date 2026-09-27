import React, { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Modal,
  Switch,
  Image,
  Alert,
  useWindowDimensions,
} from "react-native";
import Constants from "expo-constants";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle } from "react-native-svg";
import { Screen, Card } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { loadAlarmPrefs, getAlarmSound, saveAlarmPrefs, ALARM_SOUNDS } from "../lib/alarmPrefs";
import { playAlarm, stopAlarm, previewAlarm } from "../lib/alarmPlayer";
import client, { queueRequest } from "../api/client";
import { RADIUS, SPACING } from "../theme/theme";

const fmtClock = (secs) => {
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

const isExpoGo = Constants.appOwnership === "expo";

function CountdownRing({ size, progress, color, colors, time, label, running }) {
  const strokeWidth = size >= 280 ? 11 : 9;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const normalizedProgress = Math.max(0, Math.min(1, progress));

  return (
    <View
      style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}
      accessibilityLabel={`${label}, ${time} remaining`}
    >
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.border}
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - normalizedProgress)}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={ringStyles.content}>
        <View style={[ringStyles.status, { backgroundColor: color + "18" }]}>
          <View style={[ringStyles.statusDot, { backgroundColor: color }]} />
          <Text style={[ringStyles.statusText, { color }]}>
            {running ? "IN PROGRESS" : "READY"}
          </Text>
        </View>
        <Text style={[ringStyles.time, { color: colors.text }]}>{time}</Text>
        <Text style={[ringStyles.label, { color: colors.textMuted }]}>{label}</Text>
      </View>
    </View>
  );
}

const ringStyles = StyleSheet.create({
  content: { alignItems: "center", justifyContent: "center" },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginBottom: 9,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 8.5, fontWeight: "900", letterSpacing: 0.9 },
  time: { fontSize: 45, lineHeight: 52, fontWeight: "900", fontVariant: ["tabular-nums"], letterSpacing: -1.5 },
  label: { fontSize: 10.5, fontWeight: "800", letterSpacing: 1.1, marginTop: 2 },
});

export default function TimerScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const compact = width < 380;
  const styles = useMemo(() => createStyles(colors, wide, compact), [colors, wide, compact]);

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
        <Pressable
          onPress={() => setSettingsVisible(true)}
          accessibilityRole="button"
          accessibilityLabel="Timer settings"
          style={{ padding: 8 }}
        >
          <Ionicons name="settings-outline" size={21} color={colors.text} />
        </Pressable>
      ),
    });
  }, [navigation, colors.text]);

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
      const nextFocus = Number(editFocus) || 25;
      const nextShort = Number(editShort) || 5;
      const nextLong = Number(editLong) || 15;
      const nextSessions = Number(editSessionsBeforeLong) || 4;
      await client.patch('/auth/me', {
        focusMinutes: nextFocus,
        shortBreakMinutes: nextShort,
        longBreakMinutes: nextLong,
        sessionsBeforeLongBreak: nextSessions,
      });
      await saveAlarmPrefs({ enabled: editAlarmEnabled, soundId: editAlarmSoundId, volume: editAlarmVolume });
      setAlarmPrefs({ enabled: editAlarmEnabled, soundId: editAlarmSoundId, volume: editAlarmVolume });
      await refreshUser();
      const nextDuration = mode === "focus" ? nextFocus : mode === "short" ? nextShort : nextLong;
      setRunning(false);
      setSecondsLeft(nextDuration * 60);
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
  const selectedTask = tasks.find((task) => task.id === activeTaskId);
  const selectedSubject = subjects.find((subject) => subject.id === activeSubjectId);
  const totalSeconds = Math.max(1, durationFor(mode) * 60);
  const remainingProgress = secondsLeft / totalSeconds;
  const ringSize = wide ? 292 : compact ? 218 : 258;
  const cycleProgress = cyclesDone % sessionsBeforeLongBreak;
  const nextBreakLabel =
    (cyclesDone + 1) % sessionsBeforeLongBreak === 0 ? "Long break" : "Short break";

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.page}
      >
        <View style={styles.header}>
          <View style={styles.headerIdentity}>
            <View style={styles.logoWrap}>
              <Image source={require("../theme/logo.png")} style={styles.logo} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>FOCUS TIMER</Text>
              <Text style={styles.greeting}>
                Ready to focus, {user?.name?.split(" ")[0] || "student"}?
              </Text>
              <Text style={styles.headerSubtitle}>Choose a task, start the timer, and stay in the zone.</Text>
            </View>
          </View>
          <Pressable
            onPress={() => setSettingsVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Open timer settings"
            style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
          >
            <Ionicons name="options-outline" size={21} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.layout}>
          <View style={styles.timerColumn}>
            <View style={styles.timerCard}>
              <View style={styles.modeRow}>
                {Object.entries(MODES).map(([key, meta]) => {
                  const selected = mode === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => switchMode(key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={({ pressed }) => [
                        styles.modeButton,
                        selected && { backgroundColor: meta.color },
                        pressed && { opacity: 0.8 },
                      ]}
                    >
                      <Ionicons
                        name={key === "focus" ? "flash-outline" : key === "short" ? "cafe-outline" : "moon-outline"}
                        size={14}
                        color={selected ? "#FFFFFF" : colors.textMuted}
                      />
                      <Text style={[styles.modeButtonText, selected && { color: "#FFFFFF" }]}>
                        {meta.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {(selectedTask || selectedSubject) && (
                <View style={styles.activeContext}>
                  <View style={[styles.activeContextIcon, { backgroundColor: modeColor + "18" }]}>
                    <Ionicons name="bookmark-outline" size={15} color={modeColor} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.activeContextLabel}>CURRENT SESSION</Text>
                    <Text style={styles.activeContextTitle} numberOfLines={1}>
                      {selectedTask?.title || selectedSubject?.name}
                    </Text>
                  </View>
                  {selectedSubject && selectedTask && (
                    <Text style={styles.activeContextSubject} numberOfLines={1}>
                      {selectedSubject.name}
                    </Text>
                  )}
                </View>
              )}

              <View style={styles.clockWrap}>
                <CountdownRing
                  size={ringSize}
                  progress={remainingProgress}
                  color={modeColor}
                  colors={colors}
                  time={fmtClock(secondsLeft)}
                  label={MODES[mode].label.toUpperCase()}
                  running={running}
                />
              </View>

              <Text style={styles.timerMessage}>
                {running
                  ? mode === "focus"
                    ? "Stay with it — distractions can wait."
                    : "Breathe, reset, and recharge."
                  : mode === "focus"
                    ? "When you're ready, begin your focus session."
                    : "Take a well-earned break."}
              </Text>

              <View style={styles.controlsRow}>
                <Pressable
                  onPress={() => {
                    setRunning(false);
                    setSecondsLeft(durationFor(mode) * 60);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Reset timer"
                  style={({ pressed }) => [styles.iconControl, pressed && styles.pressed]}
                >
                  <Ionicons name="refresh" size={20} color={colors.textMuted} />
                  <Text style={styles.iconControlText}>Reset</Text>
                </Pressable>

                <Pressable
                  onPress={() => setRunning((current) => !current)}
                  accessibilityRole="button"
                  accessibilityLabel={running ? "Pause timer" : "Start timer"}
                  style={({ pressed }) => [
                    styles.playButton,
                    { backgroundColor: modeColor, shadowColor: modeColor },
                    pressed && styles.playButtonPressed,
                  ]}
                >
                  <Ionicons name={running ? "pause" : "play"} size={22} color="#FFFFFF" />
                  <Text style={styles.playButtonText}>{running ? "Pause" : "Start focus"}</Text>
                </Pressable>

                <View style={styles.iconControl}>
                  <Text style={styles.cycleValue}>{cycleProgress}/{sessionsBeforeLongBreak}</Text>
                  <Text style={styles.iconControlText}>Rounds</Text>
                </View>
              </View>

              <View style={styles.roundProgress}>
                <View style={styles.roundHeader}>
                  <Text style={styles.roundLabel}>SESSION PROGRESS</Text>
                  <Text style={styles.nextBreak}>Next: {nextBreakLabel}</Text>
                </View>
                <View style={styles.roundDots}>
                  {Array.from({ length: sessionsBeforeLongBreak }).map((_, index) => (
                    <View
                      key={index}
                      style={[
                        styles.roundDot,
                        index < cycleProgress && { backgroundColor: modeColor, borderColor: modeColor },
                        index === cycleProgress && { borderColor: modeColor },
                      ]}
                    >
                      {index < cycleProgress && (
                        <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                      )}
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>

          <View style={styles.contextColumn}>
            <View style={styles.contextCard}>
              <View style={styles.contextHeader}>
                <View>
                  <Text style={styles.contextEyebrow}>PLAN YOUR SESSION</Text>
                  <Text style={styles.contextTitle}>What are you working on?</Text>
                </View>
                {(activeSubjectId || activeTaskId) && (
                  <Pressable
                    onPress={() => {
                      setActiveSubjectId(null);
                      setActiveTaskId(null);
                    }}
                    hitSlop={8}
                  >
                    <Text style={styles.clearText}>Clear</Text>
                  </Pressable>
                )}
              </View>

              {subjects.length > 0 && (
                <View style={styles.contextSection}>
                  <Text style={styles.sectionLabel}>SUBJECT</Text>
                  <View style={styles.chipWrap}>
                    {subjects.map((subject) => {
                      const selected = activeSubjectId === subject.id;
                      return (
                        <Pressable
                          key={subject.id}
                          onPress={() => {
                            const nextSubjectId = selected ? null : subject.id;
                            setActiveSubjectId(nextSubjectId);
                            if (
                              nextSubjectId &&
                              selectedTask &&
                              selectedTask.subjectId !== nextSubjectId
                            ) {
                              setActiveTaskId(null);
                            }
                          }}
                          style={({ pressed }) => [
                            styles.subjectChip,
                            selected && {
                              borderColor: colors.violet,
                              backgroundColor: colors.violetSoft,
                            },
                            pressed && { opacity: 0.75 },
                          ]}
                        >
                          <View
                            style={[
                              styles.subjectDot,
                              { backgroundColor: selected ? colors.violet : colors.textMuted },
                            ]}
                          />
                          <Text
                            numberOfLines={1}
                            style={[styles.subjectChipText, selected && { color: colors.violet }]}
                          >
                            {subject.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}

              <View style={styles.contextSection}>
                <View style={styles.taskSectionHeader}>
                  <Text style={styles.sectionLabel}>OPEN TASKS</Text>
                  <Text style={styles.taskCount}>{visibleTasks.length}</Text>
                </View>
                {visibleTasks.length === 0 ? (
                  <View style={styles.emptyState}>
                    <View style={styles.emptyIcon}>
                      <Ionicons name="checkmark-done-outline" size={22} color={colors.mint} />
                    </View>
                    <Text style={styles.emptyTitle}>You're all clear</Text>
                    <Text style={styles.emptyText}>
                      {activeSubjectId
                        ? "No open tasks for this subject."
                        : "Add a task from the Tasks tab, or focus without one."}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.taskList}>
                    {visibleTasks.map((task) => {
                      const selected = task.id === activeTaskId;
                      return (
                        <Pressable
                          key={task.id}
                          onPress={() => setActiveTaskId(selected ? null : task.id)}
                          style={({ pressed }) => [
                            styles.taskRow,
                            selected && {
                              borderColor: colors.tomato,
                              backgroundColor: colors.tomatoSoft,
                            },
                            pressed && { opacity: 0.78 },
                          ]}
                        >
                          <View
                            style={[
                              styles.taskSelect,
                              selected && {
                                borderColor: colors.tomato,
                                backgroundColor: colors.tomato,
                              },
                            ]}
                          >
                            {selected && <Ionicons name="checkmark" size={12} color="#FFFFFF" />}
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text
                              numberOfLines={1}
                              style={[styles.taskTitle, selected && { color: colors.tomato }]}
                            >
                              {task.title}
                            </Text>
                            <Text style={styles.taskMeta}>
                              {subjects.find((subject) => subject.id === task.subjectId)?.name || "General"}
                            </Text>
                          </View>
                          {task.estMinutes ? (
                            <View style={styles.estimateBadge}>
                              <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                              <Text style={styles.estimateText}>{task.estMinutes}m</Text>
                            </View>
                          ) : null}
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>

            <View style={styles.tipCard}>
              <View style={styles.tipIcon}>
                <Ionicons name="bulb-outline" size={18} color={colors.amber} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tipTitle}>Focus tip</Text>
                <Text style={styles.tipText}>
                  Put your phone out of reach and keep only what you need for this session.
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <Modal
        transparent
        visible={alarmVisible}
        animationType="fade"
        onRequestClose={dismissAlarm}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.alarmCard}>
            <View style={[styles.alarmIcon, { backgroundColor: modeColor + "18" }]}>
              <Ionicons name="alarm-outline" size={32} color={modeColor} />
            </View>
            <Text style={styles.modalTitle}>Time's up!</Text>
            <Text style={styles.modalBody}>
              {mode === "focus" ? "Focus session complete. Nice work!" : "Break's over — let's keep going."}
            </Text>
            <View style={styles.soundBadge}>
              <Ionicons name="volume-high-outline" size={14} color={colors.textMuted} />
              <Text style={styles.modalSound}>{alarmSound.label}</Text>
            </View>
            <Pressable
              style={[styles.modalButton, { backgroundColor: modeColor }]}
              onPress={dismissAlarm}
            >
              <Text style={styles.modalButtonText}>Dismiss alarm</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        visible={settingsVisible}
        animationType="fade"
        onRequestClose={() => setSettingsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.settingsModal}>
            <View style={styles.settingsHeader}>
              <View>
                <Text style={styles.settingsEyebrow}>PERSONALIZE YOUR FLOW</Text>
                <Text style={styles.settingsTitle}>Timer settings</Text>
              </View>
              <Pressable
                onPress={() => setSettingsVisible(false)}
                accessibilityLabel="Close timer settings"
                style={styles.closeButton}
              >
                <Ionicons name="close" size={21} color={colors.text} />
              </Pressable>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.settingsContent}
            >
              <Text style={styles.settingsIntro}>Adjust your session rhythm and alarm preferences.</Text>

              <Card style={styles.settingsSection}>
                <View style={styles.settingsSectionTitle}>
                  <View style={[styles.settingsSectionIcon, { backgroundColor: colors.violetSoft }]}>
                    <Ionicons name="timer-outline" size={17} color={colors.violet} />
                  </View>
                  <View>
                    <Text style={styles.cardTitle}>Session lengths</Text>
                    <Text style={styles.cardSubtitle}>Set durations in minutes</Text>
                  </View>
                </View>
                <View style={styles.inputGrid}>
                  <View style={styles.inputCell}>
                    <Input label="Focus" value={editFocus} onChangeText={setEditFocus} placeholder="25" keyboardType="number-pad" compact />
                  </View>
                  <View style={styles.inputCell}>
                    <Input label="Short break" value={editShort} onChangeText={setEditShort} placeholder="5" keyboardType="number-pad" compact />
                  </View>
                  <View style={styles.inputCell}>
                    <Input label="Long break" value={editLong} onChangeText={setEditLong} placeholder="15" keyboardType="number-pad" compact />
                  </View>
                  <View style={styles.inputCell}>
                    <Input label="Rounds" value={editSessionsBeforeLong} onChangeText={setEditSessionsBeforeLong} placeholder="4" keyboardType="number-pad" compact />
                  </View>
                </View>
              </Card>

              <Card style={styles.settingsSection}>
                <View style={styles.settingsSectionTitle}>
                  <View style={[styles.settingsSectionIcon, { backgroundColor: colors.amberSoft }]}>
                    <Ionicons name="notifications-outline" size={17} color={colors.amber} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle}>Alarm</Text>
                    <Text style={styles.cardSubtitle}>Know when a session ends</Text>
                  </View>
                  <Switch
                    value={editAlarmEnabled}
                    onValueChange={setEditAlarmEnabled}
                    trackColor={{ false: colors.border, true: colors.tomato }}
                    thumbColor="#FFFFFF"
                  />
                </View>

                {editAlarmEnabled && (
                  <>
                    <Text style={styles.subLabel}>SOUND</Text>
                    <View style={styles.soundOptions}>
                      {ALARM_SOUNDS.map((sound) => {
                        const selected = editAlarmSoundId === sound.id;
                        return (
                          <Pressable
                            key={sound.id}
                            onPress={() => {
                              setEditAlarmSoundId(sound.id);
                              previewAlarm(sound.id, editAlarmVolume);
                            }}
                            style={[
                              styles.soundOption,
                              selected && {
                                borderColor: colors.tomato,
                                backgroundColor: colors.tomatoSoft,
                              },
                            ]}
                          >
                            <Ionicons
                              name={selected ? "radio-button-on" : "radio-button-off"}
                              size={15}
                              color={selected ? colors.tomato : colors.textMuted}
                            />
                            <Text style={[styles.soundOptionText, selected && { color: colors.tomato }]}>
                              {sound.label}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <Text style={styles.subLabel}>VOLUME</Text>
                    <View style={styles.volumeRow}>
                      <Pressable
                        onPress={() => setEditAlarmVolume((v) => Math.max(0, Math.round((v - 0.1) * 10) / 10))}
                        style={styles.volumeBtn}
                      >
                        <Ionicons name="remove" size={17} color={colors.text} />
                      </Pressable>
                      <View style={styles.volumeTrack}>
                        <View
                          style={[
                            styles.volumeFill,
                            { width: `${editAlarmVolume * 100}%`, backgroundColor: colors.tomato },
                          ]}
                        />
                      </View>
                      <Pressable
                        onPress={() => setEditAlarmVolume((v) => Math.min(1, Math.round((v + 0.1) * 10) / 10))}
                        style={styles.volumeBtn}
                      >
                        <Ionicons name="add" size={17} color={colors.text} />
                      </Pressable>
                      <Text style={styles.volumePct}>{Math.round(editAlarmVolume * 100)}%</Text>
                    </View>
                  </>
                )}
              </Card>

              <View style={styles.settingsActions}>
                <View style={{ flex: 1 }}>
                  <Button title="Cancel" onPress={() => setSettingsVisible(false)} variant="secondary" />
                </View>
                <View style={{ flex: 1 }}>
                  <Button title="Save changes" onPress={saveTimerSettings} />
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const createStyles = (colors, wide, compact) =>
  StyleSheet.create({
    page: {
      width: "100%",
      maxWidth: 1120,
      alignSelf: "center",
      paddingTop: SPACING.lg,
      paddingBottom: 44,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: SPACING.md,
      marginBottom: SPACING.lg,
    },
    headerIdentity: { flex: 1, flexDirection: "row", alignItems: "center", gap: 13 },
    logoWrap: {
      width: compact ? 46 : 52,
      height: compact ? 46 : 52,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.violetSoft,
      borderWidth: 1,
      borderColor: colors.border,
    },
    logo: { width: compact ? 36 : 42, height: compact ? 36 : 42 },
    eyebrow: {
      color: colors.violet,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 1.1,
      marginBottom: 3,
    },
    greeting: {
      color: colors.text,
      fontSize: compact ? 18 : 21,
      lineHeight: compact ? 23 : 27,
      fontWeight: "900",
      letterSpacing: -0.4,
    },
    headerSubtitle: {
      color: colors.textMuted,
      fontSize: 11.5,
      lineHeight: 17,
      marginTop: 2,
    },
    settingsButton: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
    layout: {
      flexDirection: wide ? "row" : "column",
      alignItems: "flex-start",
      gap: SPACING.lg,
    },
    timerColumn: { width: wide ? undefined : "100%", flex: wide ? 1.15 : undefined },
    contextColumn: { width: wide ? undefined : "100%", flex: wide ? 0.85 : undefined, gap: SPACING.md },
    timerCard: {
      width: "100%",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      padding: compact ? SPACING.md : SPACING.lg,
      shadowColor: "#000",
      shadowOpacity: 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
    modeRow: {
      width: "100%",
      flexDirection: "row",
      backgroundColor: colors.bg,
      borderRadius: RADIUS.md,
      padding: 4,
      marginBottom: SPACING.md,
    },
    modeButton: {
      flex: 1,
      minHeight: 38,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: compact ? 4 : 6,
      paddingHorizontal: compact ? 3 : 8,
      borderRadius: 10,
    },
    modeButtonText: {
      color: colors.textMuted,
      fontWeight: "800",
      fontSize: compact ? 10 : 11.5,
    },
    activeContext: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingHorizontal: 11,
      paddingVertical: 9,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      marginBottom: 12,
    },
    activeContextIcon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    activeContextLabel: {
      color: colors.textMuted,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    activeContextTitle: { color: colors.text, fontSize: 12, fontWeight: "800", marginTop: 2 },
    activeContextSubject: { color: colors.textMuted, fontSize: 10.5, maxWidth: 100 },
    clockWrap: { alignItems: "center", justifyContent: "center", paddingVertical: compact ? 8 : 14 },
    timerMessage: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
      marginTop: 2,
      marginBottom: SPACING.lg,
    },
    controlsRow: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: compact ? 8 : 12,
    },
    iconControl: {
      width: compact ? 60 : 68,
      height: 58,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
    },
    iconControlText: { color: colors.textMuted, fontSize: 9.5, fontWeight: "700" },
    cycleValue: { color: colors.text, fontSize: 14, fontWeight: "900" },
    playButton: {
      minWidth: compact ? 130 : 158,
      height: 58,
      borderRadius: RADIUS.md,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      shadowOpacity: 0.28,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 5,
    },
    playButtonPressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
    playButtonText: { color: "#FFFFFF", fontWeight: "900", fontSize: 14 },
    roundProgress: {
      width: "100%",
      marginTop: SPACING.lg,
      paddingTop: SPACING.md,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    roundHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    roundLabel: {
      color: colors.textMuted,
      fontSize: 8.5,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    nextBreak: { color: colors.textMuted, fontSize: 10.5, fontWeight: "600" },
    roundDots: { flexDirection: "row", gap: 8, marginTop: 10 },
    roundDot: {
      flex: 1,
      height: 22,
      borderRadius: 7,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
    },
    contextCard: {
      width: "100%",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      padding: compact ? SPACING.md : SPACING.lg,
    },
    contextHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: SPACING.lg,
    },
    contextEyebrow: {
      color: colors.violet,
      fontSize: 8.5,
      fontWeight: "900",
      letterSpacing: 0.9,
      marginBottom: 3,
    },
    contextTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
    clearText: { color: colors.violet, fontSize: 11, fontWeight: "800" },
    contextSection: { marginBottom: SPACING.lg },
    sectionLabel: {
      color: colors.textMuted,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.9,
      marginBottom: 9,
    },
    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
    subjectChip: {
      maxWidth: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 11,
      paddingVertical: 8,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    subjectDot: { width: 6, height: 6, borderRadius: 3 },
    subjectChipText: { color: colors.text, fontSize: 11, fontWeight: "700", maxWidth: 160 },
    taskSectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    taskCount: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: "800",
      minWidth: 22,
      textAlign: "center",
      paddingVertical: 3,
      paddingHorizontal: 6,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bg,
    },
    taskList: { gap: 8 },
    taskRow: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 11,
      paddingVertical: 9,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    taskSelect: {
      width: 21,
      height: 21,
      borderRadius: 7,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    taskTitle: { color: colors.text, fontSize: 12, fontWeight: "800" },
    taskMeta: { color: colors.textMuted, fontSize: 9.5, marginTop: 2 },
    estimateBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 7,
      paddingVertical: 5,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.surface,
    },
    estimateText: { color: colors.textMuted, fontSize: 9.5, fontWeight: "700" },
    emptyState: {
      alignItems: "center",
      paddingHorizontal: SPACING.lg,
      paddingVertical: 24,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.border,
      borderRadius: RADIUS.md,
      backgroundColor: colors.bg,
    },
    emptyIcon: {
      width: 42,
      height: 42,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.mintSoft,
      marginBottom: 9,
    },
    emptyTitle: { color: colors.text, fontSize: 13, fontWeight: "800" },
    emptyText: {
      color: colors.textMuted,
      fontSize: 10.5,
      lineHeight: 16,
      textAlign: "center",
      marginTop: 4,
    },
    tipCard: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      padding: 13,
      backgroundColor: colors.amberSoft,
      borderWidth: 1,
      borderColor: colors.amber + "44",
      borderRadius: RADIUS.lg,
    },
    tipIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    tipTitle: { color: colors.text, fontSize: 11.5, fontWeight: "800" },
    tipText: { color: colors.textMuted, fontSize: 10.5, lineHeight: 16, marginTop: 2 },

    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(3, 6, 18, 0.76)",
      alignItems: "center",
      justifyContent: "center",
      padding: compact ? SPACING.lg : 28,
    },
    alarmCard: {
      width: "100%",
      maxWidth: 420,
      alignItems: "center",
      backgroundColor: colors.surface,
      borderColor: colors.border,
      borderWidth: 1,
      borderRadius: RADIUS.xl,
      padding: 28,
    },
    alarmIcon: {
      width: 66,
      height: 66,
      borderRadius: 22,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: SPACING.lg,
    },
    modalTitle: { color: colors.text, fontSize: 23, fontWeight: "900", marginBottom: 7 },
    modalBody: {
      color: colors.textMuted,
      fontSize: 13.5,
      lineHeight: 20,
      textAlign: "center",
      marginBottom: 12,
    },
    soundBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bg,
      marginBottom: 20,
    },
    modalSound: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700" },
    modalButton: {
      width: "100%",
      borderRadius: RADIUS.md,
      paddingVertical: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    modalButtonText: { color: "#FFFFFF", fontWeight: "900", fontSize: 14 },
    settingsModal: {
      width: "100%",
      maxWidth: 620,
      maxHeight: "92%",
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
      overflow: "hidden",
    },
    settingsHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: SPACING.lg,
      paddingVertical: 14,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    settingsEyebrow: {
      color: colors.violet,
      fontSize: 8,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    settingsTitle: { color: colors.text, fontSize: 18, fontWeight: "900", marginTop: 2 },
    closeButton: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    settingsContent: { padding: SPACING.lg },
    settingsIntro: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: SPACING.md },
    settingsSection: { marginBottom: SPACING.md, padding: SPACING.md },
    settingsSectionTitle: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: SPACING.md,
    },
    settingsSectionIcon: {
      width: 36,
      height: 36,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
    },
    cardTitle: { color: colors.text, fontSize: 13, fontWeight: "900" },
    cardSubtitle: { color: colors.textMuted, fontSize: 10.5, marginTop: 2 },
    inputGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
    inputCell: { width: compact ? "100%" : "48.8%" },
    subLabel: {
      color: colors.textMuted,
      fontSize: 8.5,
      fontWeight: "900",
      letterSpacing: 0.8,
      marginTop: 4,
      marginBottom: 8,
    },
    soundOptions: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: SPACING.md },
    soundOption: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    soundOptionText: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
    volumeRow: { flexDirection: "row", alignItems: "center", gap: 9 },
    volumeBtn: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    volumeTrack: {
      flex: 1,
      height: 7,
      backgroundColor: colors.border,
      borderRadius: 4,
      overflow: "hidden",
    },
    volumeFill: { height: "100%", borderRadius: 4 },
    volumePct: { color: colors.textMuted, fontSize: 10.5, fontWeight: "800", width: 34 },
    settingsActions: { flexDirection: "row", gap: 10, marginTop: 4 },
  });
