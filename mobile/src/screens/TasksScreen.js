import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  useWindowDimensions,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "../components/Screen";
import { Input } from "../components/Inputs";
import TaskDescriptionEditor from "../components/TaskDescriptionEditor";
import NoteContentPreview from "../components/NoteContentPreview";
import { useTheme } from "../context/ThemeContext";
import { usePremium } from "../context/PremiumContext";
import client from "../api/client";
import { handleLimitError, promptUpgradeLimit } from "../lib/upgradePrompt";
import { RADIUS, SPACING } from "../theme/theme";
import HeaderWallet from "../components/HeaderWallet";
import NotificationBell from "../components/NotificationBell";
import { notifyTasksChanged } from "../lib/tasks";

function parseDescriptionJson(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function blocksPlainText(blocks) {
  return (blocks || []).map((b) => b?.text || "").join(" ").toLowerCase();
}

function formatTaskDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_FILTERS = [
  { key: "all", label: "All" },
  { key: "todo", label: "To do" },
  { key: "done", label: "Completed" },
];

const TIME_PRESETS = [15, 25, 45, 60];

export default function TasksScreen() {
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();
  const { isPremium, refreshLimits } = usePremium();
  const { width, height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 900;
  const compact = width < 380;
  const modalMaxHeight = useMemo(
    () => Math.max(300, windowHeight - insets.top - insets.bottom - (compact ? 12 : 20)),
    [windowHeight, insets.top, insets.bottom, compact]
  );
  const styles = useMemo(
    () => createStyles(colors, isDark, wide, compact),
    [colors, isDark, wide, compact]
  );

  const [tasks, setTasks] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [title, setTitle] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [estMinutes, setEstMinutes] = useState("25");
  const [editingTask, setEditingTask] = useState(null);
  const [viewingTask, setViewingTask] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSubjectName, setEditSubjectName] = useState("");
  const [editEstMinutes, setEditEstMinutes] = useState("25");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState(null);
  const [descriptionBlocks, setDescriptionBlocks] = useState([]);
  const [editDescriptionBlocks, setEditDescriptionBlocks] = useState([]);
  const [taskLimits, setTaskLimits] = useState(null);

  const fetchTasks = useCallback(async (archived = showArchived, silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const { data } = await client.get(`/tasks?archived=${archived}`);
      const nextTasks = (data.tasks || []).filter((task) => Boolean(task.archived) === Boolean(archived));
      setTasks(nextTasks);
      if (data.limits) setTaskLimits(data.limits);
      await refreshLimits();
    } catch (error) {
      if (!silent) Alert.alert("Could not load tasks", error.message);
    } finally {
      if (!silent) setRefreshing(false);
    }
  }, [showArchived, refreshLimits]);

  const fetchSubjects = useCallback(async () => {
    try {
      const { data } = await client.get("/subjects");
      setSubjects((data.subjects || []).filter((subject) => !subject.archived));
    } catch {
      // Subject picker is optional; tasks still work without it.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchTasks(showArchived);
      fetchSubjects();
    }, [fetchTasks, fetchSubjects, showArchived])
  );

  const resetNewTaskForm = () => {
    setTitle("");
    setSubjectName("");
    setEstMinutes("25");
    setDescriptionBlocks([]);
  };

  const resetEditTaskForm = () => {
    setEditingTask(null);
    setEditTitle("");
    setEditSubjectName("");
    setEditEstMinutes("25");
    setEditDescriptionBlocks([]);
  };

  const closeTaskModal = () => {
    setShowAddModal(false);
    resetNewTaskForm();
    resetEditTaskForm();
  };

  const activeTaskLimitReached =
    !isPremium &&
    taskLimits?.tasks?.max != null &&
    (taskLimits.tasks.used ?? 0) >= taskLimits.tasks.max;

  const openNewTaskModal = () => {
    if (activeTaskLimitReached) {
      promptUpgradeLimit(navigation, { code: "TASK_LIMIT_EXCEEDED" });
      return;
    }
    resetEditTaskForm();
    resetNewTaskForm();
    setShowAddModal(true);
  };

  const openTaskDetails = (task) => {
    setViewingTask(task);
  };

  const closeTaskDetails = () => {
    setViewingTask(null);
  };

  const openEditTaskModal = (task) => {
    setViewingTask(null);
    setEditingTask(task);
    setEditTitle(task.title || "");
    setEditSubjectName(task.subject?.archived ? "" : task.subject?.name || "");
    setEditEstMinutes(String(task.estMinutes || 25));
    setEditDescriptionBlocks(parseDescriptionJson(task.descriptionJson));
    setShowAddModal(true);
  };

  const upsertSubjectByName = async (rawName) => {
    const inlineName = (rawName || "").trim();
    if (!inlineName) return null;

    const existing = subjects.find(
      (subject) => subject.name.toLowerCase() === inlineName.toLowerCase()
    );
    if (existing) return existing.id;

    const { data } = await client.post("/subjects", { name: inlineName });
    setSubjects((current) => [data.subject, ...current]);
    return data.subject.id;
  };

  const addTask = async () => {
    if (!title.trim()) {
      Alert.alert("Task name required", "Enter what you need to work on.");
      return;
    }

    setLoading(true);
    try {
      const subjectId = await upsertSubjectByName(subjectName);
      const { data } = await client.post("/tasks", {
        title: title.trim(),
        subjectId,
        estMinutes: Math.max(1, Number(estMinutes) || 25),
        descriptionJson: descriptionBlocks.length ? descriptionBlocks : null,
      });
      setTasks((current) => [data.task, ...current]);
      notifyTasksChanged();
      if (data.limits) setTaskLimits(data.limits);
      closeTaskModal();
      await fetchTasks(false, true);
    } catch (error) {
      if (handleLimitError(navigation, error, { title: "Unlimited tasks" })) return;
      Alert.alert("Could not add task", error.message);
    } finally {
      setLoading(false);
    }
  };

  const updateTask = async () => {
    if (!editingTask) return;
    if (!editTitle.trim()) {
      Alert.alert("Task name required", "Enter what you need to work on.");
      return;
    }

    setLoading(true);
    try {
      const subjectId = editSubjectName.trim()
        ? await upsertSubjectByName(editSubjectName)
        : null;
      const { data } = await client.patch(`/tasks/${editingTask.id}`, {
        title: editTitle.trim(),
        subjectId,
        estMinutes: Math.max(1, Number(editEstMinutes) || 25),
        descriptionJson: editDescriptionBlocks.length ? editDescriptionBlocks : null,
      });
      setTasks((current) =>
        current.map((task) =>
          task.id === editingTask.id ? { ...task, ...data.task } : task
        )
      );
      closeTaskModal();
      await fetchTasks(showArchived, true);
      notifyTasksChanged();
    } catch (error) {
      Alert.alert("Could not update task", error.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = async (task) => {
    if (showArchived) return;
    const nextCompleted = !task.completed;
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id ? { ...item, completed: nextCompleted } : item
      )
    );
    try {
      await client.patch(`/tasks/${task.id}`, { completed: nextCompleted });
      notifyTasksChanged();
    } catch (error) {
      setTasks((current) =>
        current.map((item) =>
          item.id === task.id ? { ...item, completed: task.completed } : item
        )
      );
      Alert.alert("Could not update task", error.message);
    }
  };

  const archiveTask = async (task) => {
    try {
      const { data } = await client.post(`/tasks/${task.id}/archive`);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      if (data.limits) setTaskLimits(data.limits);
      notifyTasksChanged({ removedTaskId: task.id });
    } catch (error) {
      Alert.alert("Could not archive task", error.message);
    }
  };

  const restoreTask = async (task) => {
    try {
      const { data } = await client.post(`/tasks/${task.id}/restore`);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      if (data.limits) setTaskLimits(data.limits);
      notifyTasksChanged();
    } catch (error) {
      if (handleLimitError(navigation, error, { title: "Unlimited tasks" })) return;
      Alert.alert("Could not restore task", error.message);
    }
  };

  const deleteTask = async (task) => {
    Alert.alert(
      "Delete task permanently?",
      `Permanently delete “${task.title}”? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const { data } = await client.delete(`/tasks/${task.id}`);
              setTasks((current) => current.filter((item) => item.id !== task.id));
              if (data.limits) setTaskLimits(data.limits);
              notifyTasksChanged();
            } catch (error) {
              Alert.alert("Could not delete task", error.message);
            }
          },
        },
      ]
    );
  };

  const completedCount = tasks.filter((task) => task.completed).length;
  const pendingCount = tasks.length - completedCount;
  const completionPercent = tasks.length
    ? Math.round((completedCount / tasks.length) * 100)
    : 0;
  const totalFocusSessions = tasks.reduce(
    (sum, task) => sum + (task.pomodorosSpent || 0),
    0
  );

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return tasks.filter((task) => {
      if (!showArchived && task.archived) return false;
      if (showArchived && !task.archived) return false;
      if (statusFilter === "todo" && task.completed) return false;
      if (statusFilter === "done" && !task.completed) return false;
      if (subjectFilter && task.subjectId !== subjectFilter) return false;
      if (query) {
        const haystack = [
          task.title,
          task.subject && !task.subject.archived ? task.subject.name : "",
          blocksPlainText(parseDescriptionJson(task.descriptionJson)),
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  }, [tasks, searchQuery, statusFilter, subjectFilter, showArchived]);

  const selectSubjectName = (name) => {
    if (editingTask) setEditSubjectName(name);
    else setSubjectName(name);
  };

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.page}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {!showArchived && !isPremium && taskLimits?.tasks?.max != null && (
              <View style={[styles.limitPill, { backgroundColor: colors.violetSoft, borderColor: colors.violet + "44" }]}>
                <Ionicons name="layers-outline" size={13} color={colors.violet} />
                <Text style={[styles.limitPillText, { color: colors.violet }]}>
                  {taskLimits.tasks.used ?? 0}/{taskLimits.tasks.max} Basic
                </Text>
              </View>
            )}
          </View>
          <View style={styles.headerActions}>
            <HeaderWallet compact={compact} showFriends={false} />
            <NotificationBell />
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={[styles.statCard, styles.progressStatCard]}>
            <View style={styles.statTop}>
              <View style={[styles.statIcon, { backgroundColor: colors.mintSoft }]}>
                <Ionicons name="checkmark-done-outline" size={20} color={colors.mint} />
              </View>
              <Text style={[styles.statValue, { color: colors.mint }]}>
                {completionPercent}%
              </Text>
            </View>
            <Text style={styles.statLabel}>Completion</Text>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${completionPercent}%`, backgroundColor: colors.mint },
                ]}
              />
            </View>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statTop}>
              <View style={[styles.statIcon, { backgroundColor: colors.violetSoft }]}>
                <Ionicons name="list-outline" size={20} color={colors.violet} />
              </View>
              <Text style={styles.statValue}>{pendingCount}</Text>
            </View>
            <Text style={styles.statLabel}>Still to do</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statTop}>
              <View style={[styles.statIcon, { backgroundColor: colors.amberSoft }]}>
                <Ionicons name="timer-outline" size={20} color={colors.amber} />
              </View>
              <Text style={styles.statValue}>{totalFocusSessions}</Text>
            </View>
            <Text style={styles.statLabel}>Focus sessions</Text>
          </View>
        </View>

        <View style={styles.toolbarCard}>
          <View style={styles.viewSwitch}>
            <Pressable
              onPress={() => {
                setShowArchived(false);
                setStatusFilter("all");
              }}
              style={[
                styles.viewSwitchButton,
                !showArchived && styles.viewSwitchButtonActive,
              ]}
            >
              <Ionicons
                name="list"
                size={15}
                color={!showArchived ? colors.violet : colors.textMuted}
              />
              <Text
                style={[
                  styles.viewSwitchText,
                  !showArchived && { color: colors.violet },
                ]}
              >
                Active
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setShowArchived(true);
                setStatusFilter("all");
                setSubjectFilter(null);
              }}
              style={[
                styles.viewSwitchButton,
                showArchived && styles.viewSwitchButtonActive,
              ]}
            >
              <Ionicons
                name="archive-outline"
                size={15}
                color={showArchived ? colors.violet : colors.textMuted}
              />
              <Text
                style={[
                  styles.viewSwitchText,
                  showArchived && { color: colors.violet },
                ]}
              >
                Archived
              </Text>
            </Pressable>
          </View>

          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color={colors.textMuted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Search tasks"
                placeholderTextColor={colors.textMuted}
                style={[styles.searchInput, { outlineStyle: "none" }]}
                autoCorrect={false}
              />
              {!!searchQuery && (
                <Pressable
                  onPress={() => setSearchQuery("")}
                  hitSlop={8}
                  accessibilityLabel="Clear task search"
                >
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
            <Pressable
              onPress={() => fetchTasks(showArchived)}
              accessibilityLabel="Refresh tasks"
              style={({ pressed }) => [
                styles.refreshButton,
                pressed && styles.pressed,
              ]}
            >
              {refreshing ? (
                <ActivityIndicator size="small" color={colors.violet} />
              ) : (
                <Ionicons name="refresh" size={19} color={colors.violet} />
              )}
            </Pressable>
          </View>

          {!showArchived && (
            <>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.statusFilters}
              >
                {STATUS_FILTERS.map((filter) => {
                  const selected = statusFilter === filter.key;
                  return (
                    <Pressable
                      key={filter.key}
                      onPress={() => setStatusFilter(filter.key)}
                      style={[
                        styles.filterChip,
                        selected && {
                          backgroundColor: colors.violetSoft,
                          borderColor: colors.violet,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          selected && { color: colors.violet },
                        ]}
                      >
                        {filter.label}
                      </Text>
                      {filter.key === "todo" && (
                        <View style={styles.filterCount}>
                          <Text style={styles.filterCountText}>{pendingCount}</Text>
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>

              {subjects.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.subjectFilters}
                >
                  <Pressable
                    onPress={() => setSubjectFilter(null)}
                    style={[
                      styles.subjectFilter,
                      !subjectFilter && {
                        backgroundColor: colors.surfaceRaised,
                        borderColor: colors.textMuted,
                      },
                    ]}
                  >
                    <Text style={styles.subjectFilterText}>All subjects</Text>
                  </Pressable>
                  {subjects.map((subject) => {
                    const selected = subjectFilter === subject.id;
                    return (
                      <Pressable
                        key={subject.id}
                        onPress={() => setSubjectFilter(selected ? null : subject.id)}
                        style={[
                          styles.subjectFilter,
                          selected && {
                            backgroundColor: colors.tomatoSoft,
                            borderColor: colors.tomato,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.subjectDot,
                            { backgroundColor: selected ? colors.tomato : colors.textMuted },
                          ]}
                        />
                        <Text
                          style={[
                            styles.subjectFilterText,
                            selected && { color: colors.tomato },
                          ]}
                        >
                          {subject.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              )}
            </>
          )}
        </View>

        <View style={styles.listHeader}>
          <View style={styles.listHeaderCopy}>
            <Text style={styles.listTitle}>
              {showArchived ? "Archived" : statusFilter === "done" ? "Completed" : statusFilter === "todo" ? "To do" : "All tasks"}
            </Text>
            <Text style={styles.listMeta}>
              {filteredTasks.length} {filteredTasks.length === 1 ? "task" : "tasks"}
            </Text>
          </View>
          {!showArchived && (
            <Pressable
              onPress={openNewTaskModal}
              accessibilityRole="button"
              accessibilityLabel="Add a task"
              style={({ pressed }) => [
                styles.addTaskButton,
                activeTaskLimitReached && styles.addTaskButtonMuted,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons name="add" size={18} color="#FFFFFF" />
              <Text style={styles.addTaskButtonText}>Add task</Text>
            </Pressable>
          )}
        </View>

        {filteredTasks.length === 0 ? (
          <View style={styles.emptyState}>
            <View
              style={[
                styles.emptyIcon,
                { backgroundColor: showArchived ? colors.violetSoft : colors.mintSoft },
              ]}
            >
              <Ionicons
                name={showArchived ? "archive-outline" : searchQuery ? "search-outline" : "checkmark-done-outline"}
                size={28}
                color={showArchived ? colors.violet : colors.mint}
              />
            </View>
            <Text style={styles.emptyTitle}>
              {searchQuery
                ? "No matching tasks"
                : showArchived
                  ? "No archived tasks"
                  : tasks.length
                    ? "Nothing in this view"
                    : "Your task list is clear"}
            </Text>
            <Text style={styles.emptyText}>
              {searchQuery
                ? "Try a different search or clear your filters."
                : showArchived
                  ? "Tasks you archive will stay safely organized here."
                  : tasks.length
                    ? "Change a filter to see more tasks."
                    : "Add your first task and turn your plan into progress."}
            </Text>
            {!showArchived && !tasks.length && (
              <Pressable
                onPress={openNewTaskModal}
                style={({ pressed }) => [
                  styles.emptyAction,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="add" size={17} color="#FFFFFF" />
                <Text style={styles.emptyActionText}>Add your first task</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <View style={styles.taskGrid}>
            {filteredTasks.map((task) => (
              <View
                key={task.id}
                style={[
                  styles.taskCard,
                  task.completed && !showArchived && styles.taskCardDone,
                ]}
              >
                <View style={styles.taskCardTop}>
                  <Pressable
                    onPress={() => toggleTask(task)}
                    disabled={showArchived}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: task.completed, disabled: showArchived }}
                    accessibilityLabel={`${task.completed ? "Mark incomplete" : "Mark complete"}: ${task.title}`}
                    style={[
                      styles.checkbox,
                      task.completed && {
                        backgroundColor: colors.mint,
                        borderColor: colors.mint,
                      },
                      showArchived && styles.archivedCheckbox,
                    ]}
                  >
                    {showArchived ? (
                      <Ionicons name="archive-outline" size={14} color={colors.textMuted} />
                    ) : task.completed ? (
                      <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                    ) : null}
                  </Pressable>

                  <Pressable
                    onPress={() => openTaskDetails(task)}
                    accessibilityRole="button"
                    accessibilityLabel={`View details for ${task.title}`}
                    style={({ pressed }) => [styles.taskMain, pressed && styles.pressed]}
                  >
                    <View style={styles.taskTitleRow}>
                      <Text
                        numberOfLines={2}
                        style={[
                          styles.taskTitle,
                          task.completed && !showArchived && styles.taskTitleDone,
                        ]}
                      >
                        {task.title}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </View>
                    <View style={styles.taskBadges}>
                      {task.subject?.name && !task.subject.archived && (
                        <View style={[styles.taskBadge, { backgroundColor: colors.violetSoft }]}>
                          <View style={[styles.subjectDot, { backgroundColor: colors.violet }]} />
                          <Text style={[styles.taskBadgeText, { color: colors.violet }]} numberOfLines={1}>
                            {task.subject.name}
                          </Text>
                        </View>
                      )}
                      <View style={styles.taskBadge}>
                        <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                        <Text style={styles.taskBadgeText}>{task.estMinutes || 25} min</Text>
                      </View>
                    </View>
                  </Pressable>
                </View>

                {parseDescriptionJson(task.descriptionJson).length > 0 ? (
                  <Pressable
                    onPress={() => openTaskDetails(task)}
                    accessibilityRole="button"
                    accessibilityLabel={`View details for ${task.title}`}
                    style={[styles.taskDetailsPanel, { backgroundColor: colors.bg, borderColor: colors.border }]}
                  >
                    <View style={styles.taskDetailsHeader}>
                      <Ionicons name="document-text-outline" size={14} color={colors.mint} />
                      <Text style={[styles.taskDetailsLabel, { color: colors.textMuted }]}>Details</Text>
                    </View>
                    <NoteContentPreview
                      blocks={parseDescriptionJson(task.descriptionJson)}
                      compact
                    />
                  </Pressable>
                ) : null}

                <View style={styles.taskCardFooter}>
                  <View style={styles.sessionInfo}>
                    <View style={[styles.sessionIcon, { backgroundColor: colors.amberSoft }]}>
                      <Ionicons name="timer-outline" size={14} color={colors.amber} />
                    </View>
                    <View>
                      <Text style={styles.sessionValue}>{task.pomodorosSpent || 0}</Text>
                      <Text style={styles.sessionLabel}>focus sessions</Text>
                    </View>
                  </View>

                  <View style={styles.taskActions}>
                    {showArchived ? (
                      <>
                        <Pressable
                          onPress={() => restoreTask(task)}
                          accessibilityLabel={`Restore ${task.title}`}
                          style={({ pressed }) => [
                            styles.taskAction,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Ionicons name="refresh" size={17} color={colors.mint} />
                        </Pressable>
                        <Pressable
                          onPress={() => deleteTask(task)}
                          accessibilityLabel={`Delete ${task.title} permanently`}
                          style={({ pressed }) => [
                            styles.taskAction,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Ionicons name="trash-outline" size={17} color="#EF4444" />
                        </Pressable>
                      </>
                    ) : (
                      <>
                        <Pressable
                          onPress={() => openEditTaskModal(task)}
                          accessibilityLabel={`Edit ${task.title}`}
                          style={({ pressed }) => [
                            styles.taskAction,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Ionicons name="create-outline" size={17} color={colors.violet} />
                        </Pressable>
                        <Pressable
                          onPress={() => archiveTask(task)}
                          accessibilityLabel={`Archive ${task.title}`}
                          style={({ pressed }) => [
                            styles.taskAction,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Ionicons name="archive-outline" size={17} color={colors.textMuted} />
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={closeTaskModal}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeTaskModal} accessibilityLabel="Close modal" />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={[styles.modalContainer, { maxHeight: modalMaxHeight }]}
            keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
          >
            <View
              style={[
                styles.modalCard,
                { maxHeight: modalMaxHeight, borderColor: colors.border, backgroundColor: colors.surface },
              ]}
            >
              <View style={[styles.modalHeader, styles.modalContentHorizontal]}>
                <View style={styles.modalHeaderCopy}>
                  <View style={[styles.modalIcon, { backgroundColor: colors.violetSoft }]}>
                    <Ionicons
                      name={editingTask ? "create-outline" : "add"}
                      size={22}
                      color={colors.violet}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.modalEyebrow}>
                      {editingTask ? "Planner" : "New task"}
                    </Text>
                    <Text style={styles.modalTitle} numberOfLines={1}>
                      {editingTask ? "Edit this task" : "Add a task"}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={closeTaskModal}
                  style={styles.closeButton}
                  accessibilityLabel="Close task modal"
                >
                  <Ionicons name="close" size={21} color={colors.text} />
                </Pressable>
              </View>

              <ScrollView
                style={styles.modalScroll}
                showsVerticalScrollIndicator
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                nestedScrollEnabled
                contentContainerStyle={[
                  styles.modalContent,
                  { paddingBottom: SPACING.sm },
                ]}
              >
                <Text style={styles.modalIntro}>
                  {editingTask
                    ? "Update the name, subject, or time so it matches your plan."
                    : "Give it a clear name so it’s easy to start and finish."}
                </Text>

                <View style={styles.fieldGroup}>
                  <Input
                    compact={compact}
                    label="Task name"
                    value={editingTask ? editTitle : title}
                    onChangeText={editingTask ? setEditTitle : setTitle}
                    placeholder="e.g. Review chapter 4"
                    autoFocus
                    wrapperStyle={styles.modalInputWrapper}
                    style={styles.modalField}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <View style={styles.fieldHead}>
                    <Text style={styles.fieldLabel}>Subject</Text>
                    <Text style={styles.optionalBadge}>Optional</Text>
                  </View>
                  <View style={styles.subjectChipWrap}>
                    <Pressable
                      onPress={() => selectSubjectName("")}
                      style={[
                        styles.modalSubjectChip,
                        !(editingTask ? editSubjectName : subjectName).trim() && styles.modalSubjectChipSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.modalSubjectText,
                          !(editingTask ? editSubjectName : subjectName).trim() && styles.modalSubjectTextSelected,
                        ]}
                      >
                        None
                      </Text>
                    </Pressable>
                    {subjects.map((subject) => {
                      const currentName = editingTask ? editSubjectName : subjectName;
                      const selected = currentName.trim().toLowerCase() === subject.name.toLowerCase();
                      return (
                        <Pressable
                          key={subject.id}
                          onPress={() => selectSubjectName(selected ? "" : subject.name)}
                          style={[
                            styles.modalSubjectChip,
                            selected && styles.modalSubjectChipSelected,
                          ]}
                        >
                          <Text style={[styles.modalSubjectText, selected && styles.modalSubjectTextSelected]}>
                            {subject.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  <View style={styles.subjectInputRow}>
                    <Ionicons name="pencil-outline" size={16} color={colors.textMuted} />
                    <TextInput
                      value={editingTask ? editSubjectName : subjectName}
                      onChangeText={editingTask ? setEditSubjectName : setSubjectName}
                      placeholder="Or type a new subject"
                      placeholderTextColor={colors.textMuted}
                      style={styles.subjectInput}
                    />
                    {(editingTask ? editSubjectName : subjectName).trim() ? (
                      <Pressable onPress={() => selectSubjectName("")} hitSlop={8} accessibilityLabel="Clear subject">
                        <Ionicons name="close-circle" size={16} color={colors.textMuted} />
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <View style={styles.fieldGroup}>
                  <View style={styles.fieldHead}>
                    <Text style={styles.fieldLabel}>Time estimate</Text>
                  </View>
                  <View style={styles.estimateRow}>
                    {TIME_PRESETS.map((mins) => {
                      const current = Number(editingTask ? editEstMinutes : estMinutes);
                      const selected = current === mins;
                      return (
                        <Pressable
                          key={mins}
                          onPress={() =>
                            editingTask ? setEditEstMinutes(String(mins)) : setEstMinutes(String(mins))
                          }
                          style={[styles.timeChip, selected && styles.timeChipSelected]}
                        >
                          <Text style={[styles.timeChipText, selected && styles.timeChipTextSelected]}>
                            {mins} min
                          </Text>
                        </Pressable>
                      );
                    })}
                    <View style={styles.estimateInputWrap}>
                      <TextInput
                        value={editingTask ? editEstMinutes : estMinutes}
                        onChangeText={editingTask ? setEditEstMinutes : setEstMinutes}
                        keyboardType="number-pad"
                        style={styles.estimateInput}
                        placeholder="25"
                        placeholderTextColor={colors.textMuted}
                        maxLength={3}
                      />
                      <Text style={styles.estimateUnit}>min</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.descriptionSection}>
                  <TaskDescriptionEditor
                    compact={compact}
                    inModal
                    value={editingTask ? editDescriptionBlocks : descriptionBlocks}
                    onChange={editingTask ? setEditDescriptionBlocks : setDescriptionBlocks}
                  />
                </View>
              </ScrollView>

              <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
                <View style={styles.modalActions}>
                  <Pressable
                    onPress={closeTaskModal}
                    disabled={loading}
                    style={({ pressed }) => [
                      styles.cancelButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    onPress={editingTask ? updateTask : addTask}
                    disabled={loading}
                    accessibilityLabel={editingTask ? "Save task changes" : "Add new task"}
                    style={({ pressed }) => [
                      styles.saveButton,
                      loading && { opacity: 0.6 },
                      pressed && !loading && styles.pressed,
                    ]}
                  >
                    {loading ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <>
                        <Ionicons
                          name={editingTask ? "checkmark" : "add"}
                          size={18}
                          color="#FFFFFF"
                        />
                        <Text style={styles.saveButtonText}>
                          {editingTask ? "Save changes" : "Add task"}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={Boolean(viewingTask)}
        transparent
        animationType="fade"
        onRequestClose={closeTaskDetails}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={closeTaskDetails} accessibilityLabel="Close task details" />
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={[styles.modalContainer, { maxHeight: modalMaxHeight }]}
          >
            {viewingTask ? (
              <View
                style={[
                  styles.modalCard,
                  { maxHeight: modalMaxHeight, borderColor: colors.border, backgroundColor: colors.surface },
                ]}
              >
                <View style={[styles.modalHeader, styles.modalContentHorizontal]}>
                  <View style={styles.modalHeaderCopy}>
                    <View style={[styles.modalIcon, { backgroundColor: colors.mintSoft }]}>
                      <Ionicons name="eye-outline" size={22} color={colors.mint} />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.modalEyebrow}>Task details</Text>
                      <Text style={styles.modalTitle} numberOfLines={2}>
                        {viewingTask.title}
                      </Text>
                    </View>
                  </View>
                  <Pressable
                    onPress={closeTaskDetails}
                    style={styles.closeButton}
                    accessibilityLabel="Close task details"
                  >
                    <Ionicons name="close" size={21} color={colors.text} />
                  </Pressable>
                </View>

                <ScrollView
                  style={styles.modalScroll}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                  contentContainerStyle={[styles.modalContent, { paddingBottom: SPACING.sm }]}
                >
                  <View style={styles.detailsStatusRow}>
                    <View
                      style={[
                        styles.detailsStatus,
                        {
                          backgroundColor: viewingTask.archived
                            ? colors.violetSoft
                            : viewingTask.completed
                              ? colors.mintSoft
                              : colors.amberSoft,
                        },
                      ]}
                    >
                      <Ionicons
                        name={
                          viewingTask.archived
                            ? "archive-outline"
                            : viewingTask.completed
                              ? "checkmark-circle"
                              : "ellipse-outline"
                        }
                        size={14}
                        color={
                          viewingTask.archived
                            ? colors.violet
                            : viewingTask.completed
                              ? colors.mint
                              : colors.amber
                        }
                      />
                      <Text
                        style={[
                          styles.detailsStatusText,
                          {
                            color: viewingTask.archived
                              ? colors.violet
                              : viewingTask.completed
                                ? colors.mint
                                : colors.amber,
                          },
                        ]}
                      >
                        {viewingTask.archived ? "Archived" : viewingTask.completed ? "Completed" : "To do"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.detailsMetaGrid}>
                    <View style={styles.detailsMeta}>
                      <Ionicons name="book-outline" size={16} color={colors.violet} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.detailsMetaLabel}>Subject</Text>
                        <Text style={styles.detailsMetaValue} numberOfLines={1}>
                          {viewingTask.subject?.name && !viewingTask.subject.archived
                            ? viewingTask.subject.name
                            : "None"}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.detailsMeta}>
                      <Ionicons name="time-outline" size={16} color={colors.amber} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.detailsMetaLabel}>Time</Text>
                        <Text style={styles.detailsMetaValue}>{viewingTask.estMinutes || 25} min</Text>
                      </View>
                    </View>
                    <View style={styles.detailsMeta}>
                      <Ionicons name="timer-outline" size={16} color={colors.tomato} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.detailsMetaLabel}>Focus sessions</Text>
                        <Text style={styles.detailsMetaValue}>{viewingTask.pomodorosSpent || 0}</Text>
                      </View>
                    </View>
                    {formatTaskDate(viewingTask.createdAt) ? (
                      <View style={styles.detailsMeta}>
                        <Ionicons name="calendar-outline" size={16} color={colors.mint} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.detailsMetaLabel}>Created</Text>
                          <Text style={styles.detailsMetaValue}>{formatTaskDate(viewingTask.createdAt)}</Text>
                        </View>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.detailsNotes}>
                    <Text style={styles.detailsNotesLabel}>Notes</Text>
                    {parseDescriptionJson(viewingTask.descriptionJson).length > 0 ? (
                      <NoteContentPreview blocks={parseDescriptionJson(viewingTask.descriptionJson)} />
                    ) : (
                      <Text style={styles.detailsEmptyNotes}>No notes added for this task.</Text>
                    )}
                  </View>
                </ScrollView>

                <View style={[styles.modalFooter, { borderTopColor: colors.border }]}>
                  <View style={styles.modalActions}>
                    <Pressable
                      onPress={closeTaskDetails}
                      style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
                    >
                      <Text style={styles.cancelButtonText}>Close</Text>
                    </Pressable>
                    {!viewingTask.archived && !showArchived ? (
                      <Pressable
                        onPress={() => openEditTaskModal(viewingTask)}
                        accessibilityLabel={`Edit ${viewingTask.title}`}
                        style={({ pressed }) => [styles.saveButton, pressed && styles.pressed]}
                      >
                        <Ionicons name="create-outline" size={18} color="#FFFFFF" />
                        <Text style={styles.saveButtonText}>Edit task</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              </View>
            ) : null}
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </Screen>
  );
}

const createStyles = (colors, isDark, wide, compact) =>
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
      gap: 12,
      marginBottom: SPACING.lg,
    },
    headerLeft: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 8,
    },
    headerActions: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: 8,
      flexShrink: 0,
    },
    addTaskButton: {
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingHorizontal: compact ? 12 : 14,
      borderRadius: 12,
      backgroundColor: colors.tomato,
      shadowColor: colors.tomato,
      shadowOpacity: 0.22,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
      flexShrink: 0,
    },
    addTaskButtonText: { color: "#FFFFFF", fontSize: compact ? 12.5 : 13, fontWeight: "800" },
    addTaskButtonMuted: { opacity: 0.55 },
    limitPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
    },
    limitPillText: { fontSize: 11, fontWeight: "800" },
    descriptionSection: { marginBottom: 4 },
    taskDetailsPanel: {
      marginTop: 12,
      padding: 12,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      maxHeight: compact ? 110 : 130,
      overflow: "hidden",
    },
    taskDetailsHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 8,
    },
    taskDetailsLabel: {
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.7,
      textTransform: "uppercase",
    },
    pressed: { opacity: 0.74, transform: [{ scale: 0.98 }] },

    statsGrid: {
      flexDirection: "row",
      gap: compact ? 8 : 12,
      marginBottom: SPACING.lg,
    },
    statCard: {
      flex: 1,
      minWidth: 0,
      padding: compact ? 11 : 14,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
    },
    progressStatCard: { flex: wide ? 1.4 : 1.15 },
    statTop: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    statIcon: {
      width: compact ? 32 : 38,
      height: compact ? 32 : 38,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    statValue: {
      color: colors.text,
      fontSize: compact ? 19 : 23,
      fontWeight: "900",
      letterSpacing: -0.5,
    },
    statLabel: {
      color: colors.textMuted,
      fontSize: compact ? 9 : 10.5,
      fontWeight: "700",
      marginTop: 8,
    },
    progressTrack: {
      height: 5,
      backgroundColor: colors.border,
      borderRadius: 3,
      overflow: "hidden",
      marginTop: 9,
    },
    progressFill: { height: "100%", borderRadius: 3 },

    toolbarCard: {
      padding: compact ? 10 : 13,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      marginBottom: SPACING.lg,
    },
    viewSwitch: {
      alignSelf: "flex-start",
      flexDirection: "row",
      padding: 3,
      backgroundColor: colors.bg,
      borderRadius: RADIUS.md,
      marginBottom: 11,
    },
    viewSwitchButton: {
      minHeight: 34,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      borderRadius: 9,
    },
    viewSwitchButtonActive: {
      backgroundColor: colors.violetSoft,
      borderWidth: 1,
      borderColor: colors.violet + "55",
    },
    viewSwitchText: { color: colors.textMuted, fontSize: 11, fontWeight: "800" },
    searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    searchBox: {
      flex: 1,
      minHeight: 44,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingHorizontal: 12,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      minHeight: 42,
      color: colors.text,
      fontSize: 13,
      paddingVertical: 9,
    },
    refreshButton: {
      width: 44,
      height: 44,
      borderRadius: RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.violetSoft,
      borderWidth: 1,
      borderColor: colors.violet + "44",
    },
    statusFilters: { gap: 7, paddingTop: 11 },
    filterChip: {
      minHeight: 34,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 12,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    filterChipText: { color: colors.textMuted, fontSize: 10.5, fontWeight: "800" },
    filterCount: {
      minWidth: 18,
      height: 18,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 9,
      backgroundColor: colors.surface,
    },
    filterCountText: { color: colors.textMuted, fontSize: 9, fontWeight: "900" },
    subjectFilters: {
      gap: 7,
      paddingTop: 9,
      paddingBottom: 1,
    },
    subjectFilter: {
      minHeight: 31,
      maxWidth: 180,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    subjectDot: { width: 6, height: 6, borderRadius: 3 },
    subjectFilterText: { color: colors.textMuted, fontSize: 10, fontWeight: "700" },

    listHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 11,
    },
    listHeaderCopy: { flex: 1, minWidth: 0 },
    listTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
    listMeta: { color: colors.textMuted, fontSize: 10.5, marginTop: 2 },
    taskGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 12,
    },
    taskCard: {
      width: wide ? "49.3%" : "100%",
      padding: compact ? 13 : 15,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      shadowColor: "#000",
      shadowOpacity: isDark ? 0.1 : 0.04,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
    },
    taskCardDone: { opacity: 0.72 },
    taskCardTop: { flexDirection: "row", alignItems: "flex-start", gap: 11 },
    taskMain: { flex: 1, minWidth: 0 },
    taskTitleRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
    checkbox: {
      width: 25,
      height: 25,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.textMuted,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 1,
    },
    archivedCheckbox: {
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    taskTitle: {
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontSize: 14,
      lineHeight: 19,
      fontWeight: "800",
    },
    taskTitleDone: { color: colors.textMuted, textDecorationLine: "line-through" },
    taskBadges: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 8,
    },
    taskBadge: {
      maxWidth: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bg,
    },
    taskBadgeText: {
      color: colors.textMuted,
      fontSize: 9.5,
      fontWeight: "700",
      maxWidth: 120,
    },
    taskCardFooter: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 10,
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    sessionInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
    sessionIcon: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    sessionValue: { color: colors.text, fontSize: 11, fontWeight: "900" },
    sessionLabel: { color: colors.textMuted, fontSize: 8.5, marginTop: 1 },
    taskActions: { flexDirection: "row", alignItems: "center", gap: 7 },
    taskAction: {
      width: 35,
      height: 35,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
    },

    emptyState: {
      alignItems: "center",
      paddingHorizontal: 24,
      paddingVertical: 42,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.border,
      borderRadius: RADIUS.xl,
    },
    emptyIcon: {
      width: 58,
      height: 58,
      borderRadius: 19,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 13,
    },
    emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "900" },
    emptyText: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      textAlign: "center",
      maxWidth: 360,
      marginTop: 5,
    },
    emptyAction: {
      minHeight: 42,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingHorizontal: 15,
      backgroundColor: colors.tomato,
      borderRadius: RADIUS.md,
      marginTop: 17,
    },
    emptyActionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "900" },

    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(3, 6, 18, 0.76)",
      justifyContent: "center",
      alignItems: "center",
      paddingHorizontal: compact ? SPACING.sm : SPACING.lg,
    },
    modalContainer: {
      width: "100%",
      maxWidth: 560,
      alignSelf: "center",
      flexShrink: 1,
      zIndex: 1,
    },
    modalCard: {
      width: "100%",
      flexDirection: "column",
      borderRadius: RADIUS.xl,
      borderWidth: 1,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOpacity: 0.26,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
    },
    modalScroll: {
      flexGrow: 0,
      flexShrink: 1,
      ...(Platform.OS === "web" ? { minHeight: 0 } : null),
    },
    modalContent: {
      paddingHorizontal: compact ? SPACING.lg : 22,
      paddingTop: 0,
      paddingBottom: SPACING.md,
    },
    modalContentHorizontal: {
      paddingHorizontal: compact ? SPACING.lg : 22,
      paddingTop: compact ? SPACING.lg : 22,
      paddingBottom: SPACING.sm,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 12,
    },
    modalFooter: {
      paddingHorizontal: compact ? SPACING.lg : 22,
      paddingTop: SPACING.sm,
      paddingBottom: compact ? SPACING.md : SPACING.lg,
      borderTopWidth: 1,
      backgroundColor: colors.surface,
    },
    modalHeaderCopy: { flex: 1, flexDirection: "row", alignItems: "center", gap: 11 },
    modalIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
    },
    modalEyebrow: {
      color: colors.violet,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.8,
    },
    modalTitle: { color: colors.text, fontSize: 22, fontWeight: "900", marginTop: 2, letterSpacing: -0.3 },
    closeButton: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    modalIntro: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: SPACING.lg,
    },
    fieldGroup: {
      marginBottom: SPACING.lg,
    },
    fieldHead: {
      flexDirection: "row",
      alignItems: "baseline",
      gap: 8,
      marginBottom: 8,
    },
    fieldLabel: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "700",
    },
    optionalBadge: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
    },
    modalInputWrapper: {
      flex: 0,
      marginBottom: 0,
    },
    modalField: {
      backgroundColor: colors.bg,
    },
    subjectChipWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
    },
    modalSubjectChip: {
      flexDirection: "row",
      alignItems: "center",
      alignSelf: "flex-start",
      gap: 5,
      minHeight: 36,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    modalSubjectChipSelected: {
      borderColor: colors.violet,
      backgroundColor: colors.violetSoft,
    },
    modalSubjectText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
    modalSubjectTextSelected: { color: colors.violet },
    subjectInputRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 46,
      paddingHorizontal: 12,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    subjectInput: {
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontSize: 14,
      fontWeight: "600",
      paddingVertical: 10,
      ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
    },
    estimateRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 8,
    },
    timeChip: {
      minHeight: 36,
      paddingHorizontal: 12,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      alignItems: "center",
      justifyContent: "center",
    },
    timeChipSelected: {
      borderColor: colors.amber,
      backgroundColor: colors.amberSoft,
    },
    timeChipText: { color: colors.textMuted, fontSize: 13, fontWeight: "800" },
    timeChipTextSelected: { color: colors.amber },
    estimateInputWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      minHeight: 36,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.pill,
      paddingHorizontal: 10,
    },
    estimateInput: {
      width: 36,
      minHeight: 34,
      color: colors.text,
      fontSize: 13,
      fontWeight: "800",
      textAlign: "right",
      paddingVertical: 6,
      ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
    },
    estimateUnit: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
    modalActions: { flexDirection: "row", gap: 9 },
    cancelButton: {
      flex: 1,
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.md,
    },
    cancelButtonText: { color: colors.text, fontSize: 13, fontWeight: "800" },
    saveButton: {
      flex: 1.35,
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      backgroundColor: colors.tomato,
      borderRadius: RADIUS.md,
    },
    saveButtonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "900" },
    detailsStatusRow: { marginBottom: 12 },
    detailsStatus: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: RADIUS.pill,
    },
    detailsStatusText: { fontSize: 12, fontWeight: "800" },
    detailsMetaGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginBottom: 14,
    },
    detailsMeta: {
      flexGrow: 1,
      flexBasis: compact ? "100%" : "47%",
      minWidth: compact ? "100%" : 140,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: RADIUS.md,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    detailsMetaLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700" },
    detailsMetaValue: { color: colors.text, fontSize: 14, fontWeight: "800", marginTop: 2 },
    detailsNotes: {
      padding: 12,
      borderRadius: RADIUS.md,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    detailsNotesLabel: { color: colors.text, fontSize: 13, fontWeight: "800", marginBottom: 8 },
    detailsEmptyNotes: { color: colors.textMuted, fontSize: 13, lineHeight: 18, fontWeight: "500" },
  });
