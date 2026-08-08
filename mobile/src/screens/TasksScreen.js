import React, { useState, useCallback, useEffect } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card } from "../components/Screen";
import { Input } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

export default function TasksScreen() {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const [tasks, setTasks] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [title, setTitle] = useState("");
  const [subjectName, setSubjectName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

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

  const addTask = async () => {
    if (!title.trim()) {
      Alert.alert("Missing title", "Please enter a task name.");
      return;
    }
    setLoading(true);
    try {
      // Subject is optional. If a new subject name was typed inline, create it
      // (unless it already exists) and attach it to the task.
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
      setTitle("");
      setSubjectName("");
      // Add the newly created task to state immediately so it shows up
      // without waiting for a refetch.
      setTasks((prev) => [data.task, ...prev]);
      await fetchTasks();
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
        <Pressable onPress={() => setShowArchived((v) => !v)}>
          <Text style={styles.toggle}>{showArchived ? "View Active" : "View Archived"}</Text>
        </Pressable>
      </View>

      <View style={styles.addRow}>
        <Input
          value={title}
          onChangeText={setTitle}
          placeholder={showArchived ? "Archived tasks cannot be added" : "New task..."}
          editable={!showArchived}
          style={{ flex: 1, marginBottom: 0, marginRight: 8 }}
        />
        <Input
          value={subjectName}
          onChangeText={setSubjectName}
          placeholder="New subject (optional)"
          editable={!showArchived}
          style={{ flex: 1, marginBottom: 0, marginRight: 8 }}
        />
        <Pressable onPress={addTask} style={styles.addButton} disabled={showArchived}>
          <Text style={styles.addButtonText}>+</Text>
        </Pressable>
      </View>

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
                    <Pressable onPress={() => restoreTask(item)} style={styles.actionBtn}>
                      <Text style={[styles.actionText, { color: colors.mint }]}>Restore</Text>
                    </Pressable>
                    <Pressable onPress={() => deleteTask(item)} style={styles.actionBtn}>
                      <Text style={[styles.actionText, { color: colors.tomato }]}>Delete</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <Pressable onPress={() => archiveTask(item)} style={styles.actionBtn}>
                      <Text style={[styles.actionText, { color: colors.violet }]}>Archive</Text>
                    </Pressable>
                    <Pressable onPress={() => deleteTask(item)} style={styles.actionBtn}>
                      <Text style={[styles.actionText, { color: colors.tomato }]}>Delete</Text>
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
    addRow: { flexDirection: "row", alignItems: "center" },
    addButton: {
      width: 44, height: 44, borderRadius: 10, backgroundColor: colors.tomato,
      alignItems: "center", justifyContent: "center",
    },
    addButtonText: { color: "#fff", fontSize: 20, fontWeight: "700" },
    sectionHeader: { color: colors.text, fontSize: 22, fontWeight: "700" },
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, marginBottom: 16 },
    toggle: { color: colors.tomato, fontWeight: "700", fontSize: 13 },
    disabledButton: { opacity: 0.4 },
    taskCard: { marginBottom: 10, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
    actionGroup: { flexDirection: "row", alignItems: "center" },
actionBtn: { marginLeft: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    actionText: { fontSize: 13, fontWeight: "700" },
    mutedText: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 20 },
    taskRow: {
      flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface,
      borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, marginBottom: 8,
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

