import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { useAuth } from "./AuthContext";
import client, { queueRequest } from "../api/client";
import { isSelectableTask, subscribeTasksChanged, notifyTasksChanged } from "../lib/tasks";
import { loadAlarmPrefs } from "../lib/alarmPrefs";
import { playAlarm, stopAlarm } from "../lib/alarmPlayer";
import { getTimerAccentColor, loadTimerPrefs, DEFAULT_TIMER_PREFS } from "../lib/timerPrefs";
import { navigationRef } from "../lib/navigationRef";

function asSingleDeckId(ids) {
  if (!Array.isArray(ids) || !ids.length) return [];
  const first = ids.find(Boolean);
  return first ? [first] : [];
}

function resolveModeColorHex(modeColors, modeKey) {
  const id = modeColors?.[modeKey] || DEFAULT_TIMER_PREFS.modeColors[modeKey];
  return getTimerAccentColor(id).hex;
}

const STORAGE_KEY = "focusflow_active_focus_session_v1";
const TASK_TIMERS_KEY = "focusflow_task_timers_v1";
const isExpoGo = Constants.appOwnership === "expo";

const FocusTimerContext = createContext(null);

function clampSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.round(n));
}

export function FocusTimerProvider({ children }) {
  const { user } = useAuth();
  const [mode, setMode] = useState("focus");
  const [secondsLeft, setSecondsLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [cyclesDone, setCyclesDone] = useState(0);
  const [tasks, setTasks] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [activeTaskId, setActiveTaskId] = useState(null);
  const [activeSubjectId, setActiveSubjectId] = useState(null);
  const [selectedDeckIds, setSelectedDeckIds] = useState([]);
  const [alarmVisible, setAlarmVisible] = useState(false);
  const [finishedMode, setFinishedMode] = useState("focus");
  const [alarmPrefs, setAlarmPrefs] = useState({ enabled: true, soundId: "chime", volume: 0.8 });
  const [autoStartBreak, setAutoStartBreak] = useState(false);
  const [timerModeColors, setTimerModeColors] = useState(() => ({
    ...DEFAULT_TIMER_PREFS.modeColors,
  }));
  const [hydrated, setHydrated] = useState(false);
  const [tick, setTick] = useState(0);

  const endsAtRef = useRef(null);
  const completingRef = useRef(false);
  const sessionTokenRef = useRef(null);
  const NotificationsModuleRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);
  const taskTimersRef = useRef({});
  const activeTaskIdRef = useRef(null);
  const timerSnapshotRef = useRef({
    mode: "focus",
    secondsLeft: 25 * 60,
    cyclesDone: 0,
    selectedDeckIds: [],
  });
  const applyingTaskTimerRef = useRef(false);
  const prevTaskForTimerRef = useRef(undefined);

  const sessionsBeforeLongBreak = user?.sessionsBeforeLongBreak ?? 4;

  const openTasks = useMemo(() => tasks.filter(isSelectableTask), [tasks]);
  const selectedTask = openTasks.find((task) => task.id === activeTaskId) || null;

  const focusMinutesForTask = useMemo(() => {
    const minutes = Number(selectedTask?.estMinutes);
    if (Number.isFinite(minutes) && minutes > 0) return Math.max(1, Math.round(minutes));
    return user?.focusMinutes ?? 25;
  }, [selectedTask?.estMinutes, user?.focusMinutes]);

  const durationFor = useCallback(
    (m) => {
      if (m === "focus") return focusMinutesForTask;
      if (m === "short") return user?.shortBreakMinutes ?? 5;
      return user?.longBreakMinutes ?? 15;
    },
    [focusMinutesForTask, user]
  );

  const totalSeconds = Math.max(1, durationFor(mode) * 60);

  const syncFromDeadline = useCallback(() => {
    if (!running || !endsAtRef.current) return;
    const left = clampSeconds((endsAtRef.current - Date.now()) / 1000);
    setSecondsLeft(left);
    if (left <= 0) {
      endsAtRef.current = null;
      setRunning(false);
    }
  }, [running]);

  const persistSession = useCallback(async () => {
    try {
      const payload = {
        mode,
        secondsLeft,
        running,
        endsAt: endsAtRef.current,
        cyclesDone,
        activeTaskId,
        activeSubjectId,
        selectedDeckIds,
        sessionToken: sessionTokenRef.current,
        savedAt: Date.now(),
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // non-fatal
    }
  }, [
    mode,
    secondsLeft,
    running,
    cyclesDone,
    activeTaskId,
    activeSubjectId,
    selectedDeckIds,
  ]);

  const clearPersistedSession = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }, []);

  const persistTaskTimersMap = useCallback(async () => {
    try {
      await AsyncStorage.setItem(TASK_TIMERS_KEY, JSON.stringify(taskTimersRef.current || {}));
    } catch {
      // non-fatal
    }
  }, []);

  const saveTimerForTask = useCallback(
    (taskId) => {
      if (!taskId) return;
      taskTimersRef.current = {
        ...taskTimersRef.current,
        [taskId]: {
          ...timerSnapshotRef.current,
          updatedAt: Date.now(),
        },
      };
      persistTaskTimersMap();
    },
    [persistTaskTimersMap]
  );

  useEffect(() => {
    activeTaskIdRef.current = activeTaskId;
  }, [activeTaskId]);

  useEffect(() => {
    timerSnapshotRef.current = {
      mode,
      secondsLeft,
      cyclesDone,
      selectedDeckIds: asSingleDeckId(selectedDeckIds),
    };
  }, [mode, secondsLeft, cyclesDone, selectedDeckIds]);

  // Hydrate persisted session once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [sessionRaw, timersRaw] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(TASK_TIMERS_KEY),
        ]);
        if (timersRaw && !cancelled) {
          try {
            const parsed = JSON.parse(timersRaw);
            if (parsed && typeof parsed === "object") taskTimersRef.current = parsed;
          } catch {
            taskTimersRef.current = {};
          }
        }
        if (sessionRaw && !cancelled) {
          const saved = JSON.parse(sessionRaw);
          if (saved?.mode) setMode(saved.mode);
          if (Number.isFinite(saved?.cyclesDone)) setCyclesDone(saved.cyclesDone);
          if (saved?.activeTaskId) setActiveTaskId(saved.activeTaskId);
          if (saved?.activeSubjectId) setActiveSubjectId(saved.activeSubjectId);
          if (Array.isArray(saved?.selectedDeckIds)) {
            setSelectedDeckIds(asSingleDeckId(saved.selectedDeckIds));
          }
          sessionTokenRef.current = saved?.sessionToken || null;

          if (saved?.running && saved?.endsAt) {
            const left = clampSeconds((saved.endsAt - Date.now()) / 1000);
            endsAtRef.current = saved.endsAt;
            setSecondsLeft(left);
            setRunning(left > 0);
            if (left <= 0) endsAtRef.current = null;
          } else if (Number.isFinite(saved?.secondsLeft)) {
            endsAtRef.current = null;
            setSecondsLeft(clampSeconds(saved.secondsLeft));
            setRunning(false);
          }
        }
      } catch {
        // ignore corrupt state
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    loadAlarmPrefs()
      .then((p) => setAlarmPrefs(p))
      .catch(() => {});
    loadTimerPrefs()
      .then((p) => {
        setAutoStartBreak(Boolean(p.autoStartBreak));
        if (p.modeColors) setTimerModeColors({ ...DEFAULT_TIMER_PREFS.modeColors, ...p.modeColors });
      })
      .catch(() => {});
    if (!isExpoGo) {
      import("expo-notifications")
        .then((module) => {
          NotificationsModuleRef.current = module;
          module.setNotificationHandler({
            handleNotification: async () => ({
              shouldShowAlert: true,
              shouldPlaySound: true,
              shouldSetBadge: false,
            }),
          });
          module.requestPermissionsAsync().catch(() => {});
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const fetchTasks = useCallback(async () => {
    try {
      const { data } = await client.get("/tasks", {
        params: { archived: "false", _: Date.now() },
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      const open = (data.tasks || []).filter(isSelectableTask);
      setTasks(open);
      setActiveTaskId((current) => {
        if (current && !open.some((t) => t.id === current)) {
          // Persist last snapshot for the completed/removed task, then clear selection.
          saveTimerForTask(current);
          return null;
        }
        return current;
      });
    } catch {
      // non-fatal
    }
  }, [saveTimerForTask]);

  const fetchSubjects = useCallback(async () => {
    try {
      const { data } = await client.get("/subjects", {
        params: { _: Date.now() },
        headers: { "Cache-Control": "no-cache", Pragma: "no-cache" },
      });
      const filtered = (data.subjects || []).filter(
        (s) => !s.archived && (s.name || "").toLowerCase().trim() !== "data structures"
      );
      setSubjects(filtered);
      setActiveSubjectId((current) =>
        current && !filtered.some((s) => s.id === current) ? null : current
      );
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    fetchTasks();
    fetchSubjects();
  }, [hydrated, fetchTasks, fetchSubjects]);

  useEffect(() => {
    return subscribeTasksChanged((change) => {
      if (change?.removedTaskId) {
        setTasks((current) => current.filter((task) => task.id !== change.removedTaskId));
        setActiveTaskId((current) => (current === change.removedTaskId ? null : current));
      }
      fetchTasks();
      fetchSubjects();
    });
  }, [fetchTasks, fetchSubjects]);

  const visibleSubjects = useMemo(() => {
    const byId = new Map();
    openTasks.forEach((task) => {
      if (!task.subjectId || task.subject?.archived) return;
      const subject = task.subject || subjects.find((item) => item.id === task.subjectId);
      if (subject && !subject.archived) byId.set(subject.id, subject);
    });
    return Array.from(byId.values());
  }, [openTasks, subjects]);

  const visibleTasks = useMemo(() => {
    if (!activeSubjectId) return openTasks;
    return openTasks.filter((t) => t.subjectId === activeSubjectId);
  }, [openTasks, activeSubjectId]);

  const taskDecks = useMemo(() => {
    const decks = Array.isArray(selectedTask?.decks) ? selectedTask.decks : [];
    return decks;
  }, [selectedTask]);

  const selectedTaskDeckKey = useMemo(
    () =>
      (selectedTask?.decks || [])
        .map((d) => `${d.id}:${d.completed ? 1 : 0}:${d.studyPercent || 0}`)
        .join("|"),
    [selectedTask?.decks]
  );

  // Keep selected deck in sync with the active task (single-select; prefer incomplete).
  useEffect(() => {
    if (!selectedTask) {
      if (!applyingTaskTimerRef.current) setSelectedDeckIds([]);
      return;
    }
    const decks = selectedTask.decks || [];
    const ids = decks.map((d) => d.id).filter(Boolean);
    const incompleteIds = decks.filter((d) => d?.id && !d.completed).map((d) => d.id);
    setSelectedDeckIds((current) => {
      const kept = current.find((id) => ids.includes(id) && incompleteIds.includes(id));
      if (kept) return [kept];
      const keptAny = current.find((id) => ids.includes(id));
      // Prefer an incomplete deck after auto-complete; keep selection only if still incomplete.
      if (keptAny && incompleteIds.includes(keptAny)) return [keptAny];
      if (incompleteIds.length) return [incompleteIds[0]];
      return ids.length ? [ids[0]] : [];
    });
  }, [selectedTask?.id, selectedTaskDeckKey]);

  // Restore per-task timer state when switching tasks (idle only). Reset defaults with no task.
  // Skip the first post-hydrate pass so the active session snapshot is not overwritten.
  useEffect(() => {
    if (!hydrated || running) return;
    if (prevTaskForTimerRef.current === undefined) {
      prevTaskForTimerRef.current = activeTaskId;
      return;
    }
    if (prevTaskForTimerRef.current === activeTaskId) return;
    prevTaskForTimerRef.current = activeTaskId;

    applyingTaskTimerRef.current = true;
    if (!activeTaskId) {
      setMode("focus");
      setCyclesDone(0);
      setSelectedDeckIds([]);
      endsAtRef.current = null;
      setSecondsLeft((user?.focusMinutes ?? 25) * 60);
      applyingTaskTimerRef.current = false;
      return;
    }
    const saved = taskTimersRef.current?.[activeTaskId];
    if (saved && typeof saved === "object") {
      if (saved.mode) setMode(saved.mode);
      else setMode("focus");
      if (Number.isFinite(saved.cyclesDone)) setCyclesDone(Math.max(0, Number(saved.cyclesDone) || 0));
      else setCyclesDone(0);
      endsAtRef.current = null;
      const fallbackSeconds = focusMinutesForTask * 60;
      if (Number.isFinite(saved.secondsLeft) && saved.secondsLeft > 0) {
        setSecondsLeft(clampSeconds(saved.secondsLeft));
      } else {
        setSecondsLeft(fallbackSeconds);
      }
      if (Array.isArray(saved.selectedDeckIds) && saved.selectedDeckIds.length) {
        setSelectedDeckIds(asSingleDeckId(saved.selectedDeckIds));
      }
    } else {
      setMode("focus");
      setCyclesDone(0);
      endsAtRef.current = null;
      setSecondsLeft(focusMinutesForTask * 60);
    }
    applyingTaskTimerRef.current = false;
    // Only re-apply when the selected task changes, not on every focus duration tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTaskId, hydrated, running]);

  const handleSessionComplete = useCallback(async () => {
    if (completingRef.current) return;
    completingRef.current = true;
    setRunning(false);
    endsAtRef.current = null;
    sessionTokenRef.current = null;

    const endedMode = mode;
    setFinishedMode(endedMode);

    if (alarmPrefs.enabled) {
      try {
        await playAlarm(alarmPrefs.soundId, alarmPrefs.volume);
        setAlarmVisible(true);
      } catch {
        setAlarmVisible(true);
      }
    }

    const NotificationsModule = NotificationsModuleRef.current;
    if (NotificationsModule) {
      try {
        await NotificationsModule.scheduleNotificationAsync({
          content: {
            title:
              endedMode === "focus"
                ? "Focus session complete"
                : endedMode === "long"
                  ? "Long break is over"
                  : "Short break is over",
            body:
              endedMode === "focus"
                ? "Nice work. Time for a break."
                : "Let's start the next focus block.",
          },
          trigger: null,
        });
      } catch {
        // ignore
      }
    }

    const minutes = durationFor(endedMode);
    const payload = {
      type: endedMode,
      minutes,
      taskId: endedMode === "focus" ? activeTaskId : null,
      subjectId: activeSubjectId,
    };
    try {
      await client.post("/sessions", payload);
    } catch {
      await queueRequest("POST", "/sessions", payload);
    }

    // Timer end never auto-completes the task — only increments pomodoros server-side.
    if (endedMode === "focus" && activeTaskId) {
      notifyTasksChanged({ updatedTaskId: activeTaskId });
      fetchTasks();
    }

    if (endedMode === "focus") {
      const nextCycles = cyclesDone + 1;
      setCyclesDone(nextCycles);
      const nextMode = nextCycles % sessionsBeforeLongBreak === 0 ? "long" : "short";
      setMode(nextMode);
      const nextSeconds = durationFor(nextMode) * 60;
      setSecondsLeft(nextSeconds);
      if (autoStartBreak) {
        endsAtRef.current = Date.now() + nextSeconds * 1000;
        sessionTokenRef.current = `break-${Date.now()}`;
        setRunning(true);
      }
    } else {
      setMode("focus");
      setSecondsLeft(durationFor("focus") * 60);
    }

    await clearPersistedSession();
    completingRef.current = false;
  }, [
    mode,
    activeTaskId,
    activeSubjectId,
    cyclesDone,
    durationFor,
    sessionsBeforeLongBreak,
    alarmPrefs,
    autoStartBreak,
    clearPersistedSession,
    fetchTasks,
  ]);

  const completeRef = useRef(handleSessionComplete);
  useEffect(() => {
    completeRef.current = handleSessionComplete;
  }, [handleSessionComplete]);

  // Wall-clock ticker while running.
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => {
      if (!endsAtRef.current) return;
      const left = clampSeconds((endsAtRef.current - Date.now()) / 1000);
      setSecondsLeft(left);
      setTick((t) => t + 1);
      if (left <= 0) {
        endsAtRef.current = null;
        setRunning(false);
        setTimeout(() => completeRef.current(), 0);
      }
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!hydrated) return;
    persistSession();
    if (activeTaskIdRef.current) saveTimerForTask(activeTaskIdRef.current);
  }, [hydrated, persistSession, tick, saveTimerForTask]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (next) => {
      const prev = appStateRef.current;
      appStateRef.current = next;
      if (prev.match(/inactive|background/) && next === "active") {
        syncFromDeadline();
        if (running && endsAtRef.current && endsAtRef.current <= Date.now()) {
          setTimeout(() => completeRef.current(), 0);
        }
      } else if (next.match(/inactive|background/)) {
        persistSession();
      }
    });
    return () => sub.remove();
  }, [syncFromDeadline, running, persistSession]);

  const switchMode = useCallback(
    (m) => {
      if (running) {
        Alert.alert("Session in progress", "Pause or stop the current session before switching modes.");
        return;
      }
      setMode(m);
      endsAtRef.current = null;
      setSecondsLeft(durationFor(m) * 60);
    },
    [running, durationFor]
  );

  const pause = useCallback(() => {
    if (!running) return;
    syncFromDeadline();
    endsAtRef.current = null;
    setRunning(false);
  }, [running, syncFromDeadline]);

  const resume = useCallback(() => {
    if (running || secondsLeft <= 0) return;
    endsAtRef.current = Date.now() + secondsLeft * 1000;
    if (!sessionTokenRef.current) sessionTokenRef.current = `session-${Date.now()}`;
    setRunning(true);
  }, [running, secondsLeft]);

  const toggleRunning = useCallback(() => {
    if (running) pause();
    else resume();
  }, [running, pause, resume]);

  const resetTimer = useCallback(() => {
    endsAtRef.current = null;
    sessionTokenRef.current = null;
    setRunning(false);
    setSecondsLeft(durationFor(mode) * 60);
    clearPersistedSession();
  }, [durationFor, mode, clearPersistedSession]);

  /**
   * Restart only the current countdown to its configured duration.
   * Preserves mode, cycles, task, subject, and selected study deck.
   */
  const restartCountdown = useCallback(() => {
    const secs = Math.max(1, durationFor(mode) * 60);
    endsAtRef.current = null;
    sessionTokenRef.current = null;
    setRunning(false);
    setSecondsLeft(secs);
    clearPersistedSession();
  }, [durationFor, mode, clearPersistedSession]);

  const stopSession = useCallback(
    ({ confirm = true } = {}) => {
      const doStop = () => {
        endsAtRef.current = null;
        sessionTokenRef.current = null;
        setRunning(false);
        setSecondsLeft(durationFor(mode) * 60);
        clearPersistedSession();
      };
      if (!confirm || (!running && secondsLeft >= totalSeconds)) {
        doStop();
        return;
      }
      Alert.alert("Stop focus session?", "Your remaining time will be reset. Progress on the task is not marked complete.", [
        { text: "Keep going", style: "cancel" },
        { text: "Stop", style: "destructive", onPress: doStop },
      ]);
    },
    [running, secondsLeft, totalSeconds, durationFor, mode, clearPersistedSession]
  );

  const navigateToDeckStudy = useCallback((deck) => {
    if (!deck?.id || !navigationRef.isReady()) return false;
    // Open the deck detail screen (named Study Deck page), not the modes picker.
    const params = {
      collectionId: deck.id,
      collection: {
        id: deck.id,
        name: deck.name || "Study deck",
        color: deck.color,
        cardCount: deck.cardCount,
        _count: deck.cardCount != null ? { flashcards: deck.cardCount } : undefined,
      },
    };
    // Prefer Study stack so the Files tab stays on files (not leftover study screens).
    try {
      navigationRef.navigate("Study", {
        screen: "FlashcardCollection",
        params,
      });
      return true;
    } catch {
      try {
        navigationRef.navigate("Files", {
          screen: "FlashcardCollection",
          params,
        });
        return true;
      } catch {
        return false;
      }
    }
  }, []);

  /** Open one selected deck (or prompt when several). Safe while timer is running. */
  const openSelectedDecks = useCallback(
    ({
      deckId = null,
      deckIds: deckIdsOverride = null,
      decks: decksOverride = null,
      title = "Start studying?",
      message = "Which deck do you want to open? The timer keeps running.",
      cancelLabel = "Not now",
    } = {}) => {
      const activeDeckIds = asSingleDeckId(
        Array.isArray(deckIdsOverride) ? deckIdsOverride : selectedDeckIds
      );
      const decksLookup =
        Array.isArray(decksOverride) && decksOverride.length ? decksOverride : taskDecks;
      const openStudyDeck = (deck) => {
        if (deck) navigateToDeckStudy(deck);
      };

      const chosen = deckId ? decksLookup.find((d) => d.id === deckId) : null;
      if (chosen) {
        openStudyDeck(chosen);
        return { opened: true, count: 1 };
      }
      if (activeDeckIds.length === 1) {
        openStudyDeck(decksLookup.find((d) => d.id === activeDeckIds[0]));
        return { opened: true, count: 1 };
      }
      if (activeDeckIds.length > 1) {
        const decks = activeDeckIds
          .map((id) => decksLookup.find((d) => d.id === id))
          .filter(Boolean);
        if (!decks.length) return { opened: false, count: 0 };
        // Android Alert max ~3 buttons: first deck, second / more, or cancel.
        const first = decks[0];
        const second = decks[1];
        const buttons = [
          {
            text: (first?.name || "Deck 1").slice(0, 18),
            onPress: () => openStudyDeck(first),
          },
        ];
        if (second) {
          buttons.push({
            text: decks.length > 2 ? "Other deck…" : (second.name || "Deck 2").slice(0, 18),
            onPress: () => {
              if (decks.length <= 2) {
                openStudyDeck(second);
                return;
              }
              Alert.alert(
                "Choose a deck",
                "Open one of the remaining decks — the timer keeps running.",
                [
                  ...decks.slice(1, 3).map((deck) => ({
                    text: (deck.name || "Deck").slice(0, 18),
                    onPress: () => openStudyDeck(deck),
                  })),
                  { text: "Stay on Timer", style: "cancel" },
                ]
              );
            },
          });
        }
        buttons.push({ text: cancelLabel, style: "cancel" });
        Alert.alert(title, message, buttons);
        return { opened: true, count: decks.length, prompted: true };
      }
      return { opened: false, count: 0 };
    },
    [selectedDeckIds, taskDecks, navigateToDeckStudy]
  );

  const startFocusSession = useCallback(
    ({
      openDeck = true,
      deckId = null,
      deckIds: deckIdsOverride = null,
      decks: decksOverride = null,
      focusMinutes: focusMinutesOverride = null,
      forceFocus = false,
    } = {}) => {
      if (running) {
        Alert.alert("Already focusing", "A focus session is already running.");
        return { started: false, reason: "already_running" };
      }

      // forceFocus avoids stale `mode` when started from Tasks after a break.
      const effectiveMode = forceFocus ? "focus" : mode;
      if (forceFocus && mode !== "focus") setMode("focus");

      const overrideMins = Number(focusMinutesOverride);
      const minutes =
        effectiveMode === "focus" && Number.isFinite(overrideMins) && overrideMins > 0
          ? Math.max(1, Math.round(overrideMins))
          : durationFor(effectiveMode === "focus" ? "focus" : effectiveMode);
      const secs =
        effectiveMode === "focus" &&
        !(Number.isFinite(overrideMins) && overrideMins > 0) &&
        secondsLeft > 0 &&
        secondsLeft < minutes * 60
          ? secondsLeft
          : minutes * 60;

      const beginRunning = () => {
        endsAtRef.current = Date.now() + secs * 1000;
        sessionTokenRef.current = `session-${Date.now()}`;
        setSecondsLeft(secs);
        setRunning(true);
      };

      if (effectiveMode !== "focus") {
        beginRunning();
        return { started: true };
      }

      beginRunning();

      const activeDeckIds = asSingleDeckId(
        Array.isArray(deckIdsOverride) ? deckIdsOverride : selectedDeckIds
      );
      const decksLookup =
        Array.isArray(decksOverride) && decksOverride.length ? decksOverride : taskDecks;
      const targetId = deckId || activeDeckIds[0] || null;
      const targetDeck = targetId
        ? decksLookup.find((d) => d.id === targetId)
        : null;
      // Navigate only when a non-completed study deck is selected.
      if (openDeck && targetDeck && !targetDeck.completed) {
        openSelectedDecks({
          deckId: targetDeck.id,
          deckIds: [targetDeck.id],
          decks: decksLookup,
        });
      }

      return { started: true, deckIds: activeDeckIds };
    },
    [
      running,
      mode,
      durationFor,
      secondsLeft,
      selectedDeckIds,
      taskDecks,
      openSelectedDecks,
    ]
  );

  /** Select a task, jump to Timer, and optionally start focus with its decks. */
  const startFocusForTask = useCallback(
    (task, { autoStart = true } = {}) => {
      if (!task?.id) return { started: false };
      if (running) {
        Alert.alert(
          "Focus session running",
          "Pause or finish the current session before starting a different task."
        );
        return { started: false, reason: "already_running" };
      }
      const prevId = activeTaskIdRef.current;
      if (prevId && prevId !== task.id) saveTimerForTask(prevId);
      const deckRecords = (task.decks || []).filter((d) => d?.id);
      const primaryDeck =
        deckRecords.find((d) => !d.completed) || deckRecords[0] || null;
      const primaryDeckId = primaryDeck?.id || null;
      const selectedIds = primaryDeckId ? [primaryDeckId] : [];
      // Restore this task's saved timer when resuming without auto-start; auto-start uses a fresh focus block.
      const saved = taskTimersRef.current?.[task.id];
      if (!autoStart && saved && typeof saved === "object") {
        setMode(saved.mode || "focus");
        setCyclesDone(Number.isFinite(saved.cyclesDone) ? Math.max(0, Number(saved.cyclesDone) || 0) : 0);
        if (Number.isFinite(saved.secondsLeft) && saved.secondsLeft > 0) {
          setSecondsLeft(clampSeconds(saved.secondsLeft));
        } else {
          setMode("focus");
          const est = Number(task.estMinutes);
          setSecondsLeft((Number.isFinite(est) && est > 0 ? est : user?.focusMinutes ?? 25) * 60);
        }
      } else {
        setMode("focus");
      }
      setActiveTaskId(task.id);
      setSelectedDeckIds(selectedIds);
      // Keep local task list in sync so Timer UI shows this task's decks immediately.
      setTasks((prev) => {
        const idx = prev.findIndex((t) => t.id === task.id);
        if (idx === -1) return [task, ...prev];
        const next = prev.slice();
        next[idx] = { ...next[idx], ...task, decks: task.decks ?? next[idx].decks };
        return next;
      });
      if (navigationRef.isReady()) {
        try {
          navigationRef.navigate("Timer");
        } catch {
          // ignore
        }
      }
      if (autoStart) {
        const est = Number(task.estMinutes);
        setTimeout(() => {
          startFocusSession({
            openDeck: Boolean(primaryDeckId && !primaryDeck?.completed),
            deckIds: selectedIds,
            decks: deckRecords,
            deckId: primaryDeckId,
            focusMinutes: Number.isFinite(est) && est > 0 ? est : null,
            forceFocus: true,
          });
        }, 350);
      }
      return { started: Boolean(autoStart), queued: true };
    },
    [running, startFocusSession, saveTimerForTask, user?.focusMinutes]
  );

  /** Single-select: tapping a deck selects it; tapping again clears. Locked while focus is running. */
  const toggleDeckSelection = useCallback(
    (deckId) => {
      if (!deckId) return;
      if (running) {
        Alert.alert(
          "Focus session running",
          "Pause or finish the current session before changing the selected deck."
        );
        return;
      }
      setSelectedDeckIds((current) => {
        if (current.length === 1 && current[0] === deckId) return [];
        return [deckId];
      });
    },
    [running]
  );

  /** Persist deck completion and recompute task progress from the server. */
  const setTaskDeckCompleted = useCallback(
    async (taskId, collectionId, completed) => {
      if (!taskId || !collectionId) return null;
      const { data } = await client.patch(`/tasks/${taskId}/decks/${collectionId}`, {
        completed: Boolean(completed),
      });
      const task = data?.task;
      if (task?.id) {
        setTasks((prev) => {
          if (!isSelectableTask(task)) {
            return prev.filter((item) => item.id !== task.id);
          }
          const idx = prev.findIndex((t) => t.id === task.id);
          if (idx === -1) return [task, ...prev];
          const next = prev.slice();
          next[idx] = { ...next[idx], ...task };
          return next;
        });
        if (!isSelectableTask(task) && activeTaskIdRef.current === task.id) {
          saveTimerForTask(task.id);
          setActiveTaskId(null);
        }
        notifyTasksChanged({ updatedTaskId: task.id, task });
      }
      return task || null;
    },
    [saveTimerForTask]
  );

  const setTimerModeColor = useCallback((modeKey, accentColorId) => {
    if (!["focus", "short", "long"].includes(modeKey)) return;
    const nextId = getTimerAccentColor(accentColorId).id;
    setTimerModeColors((current) => ({ ...current, [modeKey]: nextId }));
  }, []);

  const setTimerModeColorsAll = useCallback((nextColors) => {
    if (!nextColors || typeof nextColors !== "object") return;
    setTimerModeColors((current) => {
      const merged = { ...current };
      for (const key of ["focus", "short", "long"]) {
        if (nextColors[key]) merged[key] = getTimerAccentColor(nextColors[key]).id;
      }
      return merged;
    });
  }, []);

  /** @deprecated prefer setTimerModeColor("focus", id) */
  const setTimerAccent = useCallback((accentColorId) => {
    setTimerModeColor("focus", accentColorId);
  }, [setTimerModeColor]);

  const assignActiveTaskId = useCallback(
    (taskId) => {
      if (running) {
        Alert.alert(
          "Focus session running",
          "Pause or finish the current session before switching tasks."
        );
        return;
      }
      const nextId = taskId || null;
      const prevId = activeTaskIdRef.current;
      if (prevId && prevId !== nextId) saveTimerForTask(prevId);
      setActiveTaskId(nextId);
    },
    [running, saveTimerForTask]
  );

  const toggleActiveTask = useCallback(
    (taskId) => {
      if (running) {
        Alert.alert(
          "Focus session running",
          "Pause or finish the current session before switching tasks."
        );
        return;
      }
      const prevId = activeTaskIdRef.current;
      const nextId = prevId === taskId ? null : taskId;
      if (prevId && prevId !== nextId) saveTimerForTask(prevId);
      setActiveTaskId(nextId);
    },
    [running, saveTimerForTask]
  );

  const dismissAlarm = useCallback(() => {
    setAlarmVisible(false);
    stopAlarm();
  }, []);

  const goToTimerScreen = useCallback(() => {
    if (!navigationRef.isReady()) return;
    try {
      navigationRef.navigate("Timer");
    } catch {
      // ignore
    }
  }, []);

  const hasActiveSession = running || (secondsLeft > 0 && secondsLeft < totalSeconds);
  const showFloatingBubble = hydrated && hasActiveSession;
  const timerAccentId = timerModeColors.focus || DEFAULT_TIMER_PREFS.modeColors.focus;
  const timerAccentColor = resolveModeColorHex(timerModeColors, "focus");
  const timerModeColorHex = useMemo(
    () => ({
      focus: resolveModeColorHex(timerModeColors, "focus"),
      short: resolveModeColorHex(timerModeColors, "short"),
      long: resolveModeColorHex(timerModeColors, "long"),
    }),
    [timerModeColors]
  );
  const activeTimerColor = timerModeColorHex[mode] || timerAccentColor;

  const value = useMemo(
    () => ({
      hydrated,
      mode,
      secondsLeft,
      running,
      cyclesDone,
      tasks: openTasks,
      subjects,
      activeTaskId,
      activeSubjectId,
      selectedTask,
      selectedDeckIds,
      taskDecks,
      visibleTasks,
      visibleSubjects,
      focusMinutesForTask,
      totalSeconds,
      sessionsBeforeLongBreak,
      alarmVisible,
      finishedMode,
      alarmPrefs,
      setAlarmPrefs,
      autoStartBreak,
      setAutoStartBreak,
      timerAccentId,
      timerAccentColor,
      timerModeColors,
      timerModeColorHex,
      activeTimerColor,
      setTimerAccent,
      setTimerModeColor,
      setTimerModeColorsAll,
      showFloatingBubble,
      hasActiveSession,
      fetchTasks,
      fetchSubjects,
      setActiveTaskId: assignActiveTaskId,
      toggleActiveTask,
      setActiveSubjectId,
      setSelectedDeckIds: (ids) => {
        if (running) {
          Alert.alert(
            "Focus session running",
            "Pause or finish the current session before changing the selected deck."
          );
          return;
        }
        setSelectedDeckIds(asSingleDeckId(ids));
      },
      toggleDeckSelection,
      setTaskDeckCompleted,
      switchMode,
      pause,
      resume,
      toggleRunning,
      resetTimer,
      restartCountdown,
      stopSession,
      startFocusSession,
      startFocusForTask,
      openSelectedDecks,
      navigateToDeckStudy,
      goToTimerScreen,
      dismissAlarm,
      durationFor,
      setSecondsLeft,
      setMode,
      setCyclesDone,
      setRunning,
      notifyDurationChange: (minutes) => {
        if (!running && mode === "focus") {
          setSecondsLeft(Math.max(1, minutes) * 60);
        }
      },
    }),
    [
      hydrated,
      mode,
      secondsLeft,
      running,
      cyclesDone,
      openTasks,
      subjects,
      activeTaskId,
      activeSubjectId,
      selectedTask,
      selectedDeckIds,
      taskDecks,
      visibleTasks,
      visibleSubjects,
      focusMinutesForTask,
      totalSeconds,
      sessionsBeforeLongBreak,
      alarmVisible,
      finishedMode,
      alarmPrefs,
      autoStartBreak,
      timerAccentId,
      timerAccentColor,
      timerModeColors,
      timerModeColorHex,
      activeTimerColor,
      setTimerAccent,
      setTimerModeColor,
      setTimerModeColorsAll,
      showFloatingBubble,
      hasActiveSession,
      fetchTasks,
      fetchSubjects,
      assignActiveTaskId,
      toggleActiveTask,
      toggleDeckSelection,
      setTaskDeckCompleted,
      switchMode,
      pause,
      resume,
      toggleRunning,
      resetTimer,
      restartCountdown,
      stopSession,
      startFocusSession,
      startFocusForTask,
      openSelectedDecks,
      navigateToDeckStudy,
      goToTimerScreen,
      dismissAlarm,
      durationFor,
    ]
  );

  return <FocusTimerContext.Provider value={value}>{children}</FocusTimerContext.Provider>;
}

export function useFocusTimer() {
  const ctx = useContext(FocusTimerContext);
  if (!ctx) {
    throw new Error("useFocusTimer must be used within FocusTimerProvider");
  }
  return ctx;
}
