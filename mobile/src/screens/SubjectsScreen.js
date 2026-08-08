import React, { useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Screen, Card } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";

export default function SubjectsScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const [subjects, setSubjects] = useState([]);
  const [name, setName] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchSubjects = useCallback(async () => {
    try {
      const { data } = await client.get(`/subjects${showArchived ? "?archived=true" : ""}`);
      setSubjects(data.subjects);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, [showArchived]);

  useFocusEffect(
    useCallback(() => {
      fetchSubjects();
    }, [fetchSubjects])
  );

  const addSubject = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await client.post("/subjects", { name: name.trim() });
      setName("");
      await fetchSubjects();
    } catch (e) {
      Alert.alert("Error", e.message);
    } finally {
      setLoading(false);
    }
  };

  const archiveSubject = async (subject) => {
    try {
      await client.post(`/subjects/${subject.id}/archive`);
      await fetchSubjects();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const restoreSubject = async (subject) => {
    try {
      await client.post(`/subjects/${subject.id}/restore`);
      await fetchSubjects();
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const deleteSubject = async (subject) => {
    Alert.alert(
      "Delete subject?",
      `Permanently delete "${subject.name}" and all its tasks, sessions, and materials? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await client.delete(`/subjects/${subject.id}`);
              await fetchSubjects();
            } catch (e) {
              Alert.alert("Error", e.message);
            }
          },
        },
      ]
    );
  };

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Subjects</Text>
        <Pressable onPress={() => setShowArchived((v) => !v)}>
          <Text style={styles.toggle}>{showArchived ? "Active" : "Archived"}</Text>
        </Pressable>
      </View>

      <View style={styles.addRow}>
        <Input
          value={name}
          onChangeText={setName}
          placeholder={showArchived ? "Switching to active…" : "New subject..."}
          editable={!showArchived}
          style={{ flex: 1, marginBottom: 0, marginRight: 8 }}
        />
        {!showArchived && (
          <Pressable onPress={addSubject} style={styles.addButton}>
            <Text style={styles.addButtonText}>+</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        data={subjects}
        keyExtractor={(s) => s.id}
        style={{ marginTop: 12 }}
        ListEmptyComponent={<Text style={styles.mutedText}>No {showArchived ? "archived" : "active"} subjects.</Text>}
        renderItem={({ item }) => (
          <Card style={{ marginBottom: 8 }}>
            <View style={styles.subjectRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.subjectName}>{item.name}</Text>
                <Text style={styles.subjectMeta}>Created {new Date(item.createdAt).toLocaleDateString()}</Text>
              </View>
              {showArchived ? (
                <>
                  <Pressable onPress={() => restoreSubject(item)} style={styles.actionBtn}>
                    <Text style={styles.actionText}>Restore</Text>
                  </Pressable>
<Pressable onPress={() => deleteSubject(item)} style={styles.actionBtn}>
                    <Text style={[styles.actionText, { color: colors.tomato }]}>Delete</Text>
                  </Pressable>
                </>
              ) : (
                <Pressable onPress={() => archiveSubject(item)} style={styles.actionBtn}>
                  <Text style={styles.actionText}>Archive</Text>
                </Pressable>
              )}
            </View>
          </Card>
        )}
      />
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12, marginBottom: 16 },
    header: { color: colors.text, fontSize: 22, fontWeight: "700" },
    toggle: { color: colors.tomato, fontWeight: "700", fontSize: 13 },
addRow: { flexDirection: "row", alignItems: "center" },
    addButton: {
      width: 44, height: 44, borderRadius: 10, backgroundColor: colors.tomato,
      alignItems: "center", justifyContent: "center",
    },
    addButtonText: { color: "#fff", fontSize: 20, fontWeight: "700" },
    mutedText: { color: colors.textMuted, fontSize: 13, textAlign: "center", marginTop: 20 },
    subjectRow: { flexDirection: "row", alignItems: "center" },
    subjectName: { color: colors.text, fontSize: 14, fontWeight: "600" },
    subjectMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    actionBtn: {
      marginLeft: 12,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    actionText: { color: colors.tomato, fontSize: 12, fontWeight: "700" },
  });
