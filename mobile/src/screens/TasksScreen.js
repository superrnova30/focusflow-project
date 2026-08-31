import React, { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert, useWindowDimensions, Modal, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card } from "../components/Screen";
import { Input } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

export default function TasksScreen() {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const { width } = useWindowDimensions();
  const isWide = width >= 720;
  const [tasks, setTasks] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [title, setTitle] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchTasks = async () => {
    try {
      const query = showArchived ? "?archived=true" : "?archived=false";
      const { data } = await client.get(`/tasks${query}`);
      setTasks(data.tasks);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const fetchSubjects = async () => {
    try {
      const { data } = await client.get("/subjects");
      setSubjects(data.subjects);
    } catch (e) {
      // Subject picker is optional
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchTasks();
      fetchSubjects();
    }, [showArchived])
  );

  useEffect(() => {
    fetchTasks();
  }, [showArchived]);

  const resetNewTaskForm = () => {
    setTitle("");
    setSubjectName("");
  };

  const addTask = async () => {
    if (!title.trim()) {
      Alert.alert("Missing title", "Please enter a task name.");
      return;
    }
    setLoading(true);
    try {
      const inlineName = subjectName.trim();
      let subjectId = null;
      if (inlineName) {
        const existing = subjects.find(
          (s) => s.name.toLowerCase() === inlineName.toLowerCase()
        );
        if (existing) {
          subjectId = existing.id;
        } else {
          const { data: subData } = await client.post("/subjects", { name: inlineName });
          subjectId = subData.subject.id;
          setSubjects((prev) => [subData.subject, ...prev]);
        }
      }
      const { data } = await client.post("/tasks", {
        title: title.trim(),
        subjectId,
      });
      resetNewTaskForm();
      setTasks((prev) => [data.task, ...prev]);
      await fetchTasks();
      setShowAddModal(false);
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const toggleTask = async (task) => {
    try {
      await client.patch(`/tasks/${task.id}`, { completed: !task.completed });
      await fetchTasks();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const archiveTask = async (task) => {
    try {
      await client.post(`/tasks/${task.id}/archive`);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const restoreTask = async (task) => {
    try {
      await client.post(`/tasks/${task.id}/restore`);
      setTasks((prev) => prev.filter((t) => t.id !== task.id));
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const deleteTask = async (task) => {
    if (!showArchived) {
      Alert.alert("Archive first", "Archive tasks before permanently deleting them.");
      return;
    }

    Alert.alert(
      "Delete task permanently?",
      `Permanently delete "${task.title}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await client.delete(`/tasks/${task.id}`);
              setTasks((prev) => prev.filter((t) => t.id !== task.id));
            } catch (e) {
              Alert.alert("Error", e.message);
            }
          },
        },
      ]
    );
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const pct = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;

  return (
    <Screen>
      <Text style={styles.header}>Tasks</Text>

      <View style={styles.progressCard}>
        <Text style={styles.progressPct}>{pct}%</Text>
        <View>
          <Text style={styles.progressLabel}>Task Completion</Text>
          <Text style={styles.progressSub}>{completedCount} of {tasks.length} done</Text>
        </View>
      </View>

      <View style={styles.headerRow}>
        <Text style={styles.sectionHeader}>{showArchived ? "Archived Tasks" : "Active Tasks"}</Text>
        <View style={styles.actionHeaderRow}>
          <Pressable onPress={() => setShowArchived((v) => !v)}>
            <Text style={styles.toggle}>{showArchived ? "View Active" : "View Archived"}</Text>
          </Pressable>
          {!showArchived && (
            <Pressable onPress={() => setShowAddModal(true)} style={styles.primaryActionButton} accessibilityLabel="Open add task modal">
              <Text style={styles.primaryActionText}>＋</Text>
            </Pressable>
          )}
        </View>
      </View>

      <Modal
        visible={showAddModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAddModal(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setShowAddModal(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalContainer}
          >
            <Pressable style={styles.modalCard} onPress={() => {}}>
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalScrollContent}
              >
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>New Task</Text>
                  <Pressable onPress={() => setShowAddModal(false)} style={styles.closeButton} accessibilityLabel="Close new task modal">
                    <Text style={styles.closeButtonText}>×</Text>
                  </Pressable>
                </View>

                <View style={styles.modalFieldGroup}>
                  <Input
                    label="Task name"
                    value={title}
                    onChangeText={setTitle}
                    placeholder={showArchived ? "Archived tasks cannot be added" : "What do you need to do?"}
                    editable={!showArchived}
                    style={[styles.modalInput, { backgroundColor: colors.surface, borderColor: colors.mint, borderWidth: 1.5 }]}
                    autoFocus
                  />
                </View>

                <View style={styles.modalFieldGroup}>
                  <Input
                    label="Subject (optional)"
                    value={subjectName}
                    onChangeText={setSubjectName}
                    placeholder="e.g. Math, Biology, History"
                    editable={!showArchived}
                    style={[styles.modalInput, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1.2 }]}
                  />

                  <Pressable
                    onPress={addTask}
                    style={[styles.subjectAddButton, showArchived && styles.disabledButton]}
                    disabled={showArchived || loading}
                    accessibilityLabel="Add task with optional subject"
                  >
                    <Text style={styles.subjectAddButtonText}>{loading ? "..." : "+"}</Text>
                  </Pressable>
                </View>

                <Pressable
                  onPress={addTask}
                  style={[styles.modalAddButton, loading && styles.disabledButton]}
                  disabled={showArchived || loading}
                  accessibilityLabel="Add new task"
                >
                  <View style={styles.modalAddButtonInner}>
                    <View style={styles.modalPlusBadge}>
                      <Text style={styles.modalPlusText}>{loading ? "..." : "+"}</Text>
                    </View>
                    <Text style={styles.modalAddButtonText}>{loading ? "Adding..." : "Add Task"}</Text>
                  </View>
                </Pressable>
              </ScrollView>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <FlatList
        data={tasks}
        keyExtractor={(t) => t.id}
        style={{ marginTop: 12 }}
        ListEmptyComponent={
          <Text style={styles.mutedText}>
            {showArchived
              ? "No archived tasks yet. Archive completed or inactive tasks to keep them here."
              : "No tasks yet. Add your first one above."}
          </Text>
        }
        renderItem={({ item }) => (
          <Card style={styles.taskCard}>
            <View style={styles.taskRow}>
              <Pressable
                onPress={() => toggleTask(item)}
                style={[styles.checkbox, item.completed && styles.checkboxDone]}
              >
                {item.completed && <Text style={{ color: "#fff", fontSize: 12 }}>✓</Text>}
              </Pressable>
              <View style={{ flex: 1 }}>
                <Text style={[styles.taskTitle, item.completed && styles.taskTitleDone]}>{item.title}</Text>
                <Text style={styles.taskSub}>
                  {item.subject ? `${item.subject.name} · ` : ""}
                  {item.pomodorosSpent || 0} sessions spent
                </Text>
              </View>
              <View style={styles.actionGroup}>
                {showArchived ? (
                  <>
                    <Pressable onPress={() => restoreTask(item)} style={[styles.actionBtn, !isWide && styles.actionBtnCompact]}>
                      <Text style={[styles.actionText, { color: colors.mint, fontSize: isWide ? 13 : 12 }]}>Restore</Text>
                    </Pressable>
                    <Pressable onPress={() => deleteTask(item)} style={[styles.actionBtn, !isWide && styles.actionBtnCompact]}>
                      <Text style={[styles.actionText, { color: colors.tomato, fontSize: isWide ? 13 : 12 }]}>Delete</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable onPress={() => archiveTask(item)} style={[styles.actionBtn, !isWide && styles.actionBtnCompact]}>
                      <Text style={[styles.actionText, { color: colors.violet, fontSize: isWide ? 13 : 12 }]}>Archive</Text>
                    </Pressable>
                    <Pressable onPress={() => deleteTask(item)} style={[styles.actionBtn, !isWide && styles.actionBtnCompact]}>
                      <Text style={[styles.actionText, { color: colors.tomato, fontSize: isWide ? 13 : 12 }]}>Delete</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    header: { color: colors.text, fontSize: 22, fontWeight: "700", marginTop: 12, marginBottom: 16 },
    progressCard: {
      flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.surface,
      borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 14, marginBottom: 16,
    },
    progressPct: { color: colors.mint, fontSize: 22, fontWeight: "700" },
    progressLabel: { color: colors.text, fontWeight: "700", fontSize: 13 },
    progressSub: { color: colors.textMuted, fontSize: 11.5 },
    addRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      width: "100%",
      flexWrap: "nowrap",
    },
    addRowStack: {
      flexDirection: "column",
      alignItems: "stretch",
      gap: 12,
      width: "100%",
      marginTop: 4,
    },
    subjectRow: {
      flexDirection: "row",
      alignItems: "center",
      width: "100%",
      gap: 10,
      marginTop: 50,
    },
    inputFlex: {
      flex: 1,
      minWidth: 0,
      maxWidth: "100%",
      marginBottom: 0,
    },
    mobileInput: {
      marginBottom: 0,
    },
    subjectInput: {
      flex: 1,
      minWidth: 80,
      maxWidth: "100%",
    },
    addButton: {
      width: 48,
      height: 48,
      minWidth: 48,
      flexShrink: 0,
      borderRadius: 12,
      backgroundColor: colors.tomato,
      alignItems: "center",
      justifyContent: "center",
      marginLeft: 2,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 6,
      elevation: 2,
    },
    addButtonCompact: {
      width: 48,
      minWidth: 48,
      marginLeft: 0,
    },
    addButtonText: { color: "#fff", fontSize: 20, fontWeight: "700" },
    sectionHeader: { color: colors.text, fontSize: 22, fontWeight: "700" },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, marginBottom: 16 },
    actionHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    primaryActionButton: {
      backgroundColor: colors.tomato,
      width: 48,
      height: 48,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.18,
      shadowRadius: 8,
      elevation: 4,
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.35)",
    },
    primaryActionText: { color: "#fff", fontWeight: "800", fontSize: 28, lineHeight: 28 },
    toggle: { color: colors.tomato, fontWeight: "700", fontSize: 13 },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.46)",
      justifyContent: "center",
      alignItems: "center",
      padding: 20,
    },
    modalContainer: {
      width: "100%",
      maxWidth: 460,
      alignItems: "center",
    },
    modalCard: {
      width: "100%",
      maxHeight: "82%",
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 18,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.18,
      shadowRadius: 18,
      elevation: 8,
    },
    modalScrollContent: {
      paddingBottom: 4,
    },
    modalHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 14,
    },
    modalTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: "700",
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    closeButtonText: {
      color: colors.text,
      fontSize: 22,
      lineHeight: 22,
      fontWeight: "600",
    },
    modalFieldGroup: {
      width: "100%",
      marginBottom: 8,
    },
    subjectAddButton: {
      alignSelf: "flex-end",
      width: 46,
      height: 46,
      borderRadius: 14,
      backgroundColor: colors.tomato,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 7,
      elevation: 3,
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.35)",
    },
    subjectAddButtonText: {
      color: "#fff",
      fontSize: 28,
      fontWeight: "800",
      lineHeight: 28,
    },
    modalInput: {
      width: "100%",
      marginBottom: 10,
    },
    modalAddButton: {
      width: "100%",
      minHeight: 62,
      borderRadius: 16,
      backgroundColor: colors.tomato,
      alignItems: "center",
      justifyContent: "center",
      alignSelf: "stretch",
      marginTop: 10,
      paddingVertical: 14,
      paddingHorizontal: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.18,
      shadowRadius: 8,
      elevation: 4,
      borderWidth: 2,
      borderColor: "rgba(255,255,255,0.35)",
    },
    modalAddButtonInner: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 12,
    },
    modalPlusBadge: {
      width: 30,
      height: 30,
      borderRadius: 10,
      backgroundColor: "rgba(255,255,255,0.18)",
      alignItems: "center",
      justifyContent: "center",
    },
    modalPlusText: { color: "#fff", fontSize: 24, fontWeight: "800", lineHeight: 24 },
    modalAddButtonText: { color: "#fff", fontSize: 17, fontWeight: "800", textAlign: "center" },
    disabledButton: { opacity: 0.4 },
    taskCard: { marginBottom: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
    actionGroup: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap" },
    actionBtn: { marginLeft: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    actionBtnCompact: { marginLeft: 8, paddingVertical: 4, paddingHorizontal: 8 },
    actionText: { fontSize: 13, fontWeight: "700" },
    mutedText: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 20 },
    taskRow: {
      flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface,
      borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 8, flexWrap: "wrap",
    },
    checkbox: {
      width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.textMuted,
      alignItems: "center", justifyContent: "center",
    },
    checkboxDone: { backgroundColor: colors.mint, borderColor: colors.mint },
    taskTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
    taskTitleDone: { color: colors.textMuted, textDecorationLine: "line-through" },
    taskSub: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    deleteText: { color: colors.tomato, fontSize: 12, fontWeight: "700" },
  });

