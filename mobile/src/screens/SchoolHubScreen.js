import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, useWindowDimensions } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import StudentCard from "../components/StudentCard";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import client from "../api/client";
import { startDeckQuiz } from "../lib/publicStudy";

const TABS = [
  { key: "decks", label: "Decks" },
  { key: "leaderboard", label: "Leaderboard" },
];

export default function SchoolHubScreen({ route, navigation }) {
  const { school: initialSchool } = route.params || {};
  const { colors } = useTheme();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 400;
  const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);
  const [tab, setTab] = useState("decks");
  const [data, setData] = useState({ school: initialSchool || "", decks: [], notes: [], leaderboard: [] });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: payload } = await client.get("/students/school", { params: { name: initialSchool || user?.school } });
      setData(payload);
    } catch {
      setData({ school: initialSchool || user?.school || "", decks: [], notes: [], leaderboard: [] });
    } finally {
      setLoading(false);
    }
  }, [initialSchool, user?.school]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const goStudy = (screen, params) => {
    const names = navigation.getState?.()?.routeNames || [];
    if (names.includes(screen)) {
      navigation.navigate(screen, params);
      return;
    }
    navigation.navigate("Study", { screen, params });
  };

  const openProfile = (student) => {
    const names = navigation.getState?.()?.routeNames || [];
    if (names.includes("StudentProfile")) {
      navigation.navigate("StudentProfile", { userId: student.id, name: student.name });
      return;
    }
    navigation.navigate("Profile", { screen: "StudentProfile", params: { userId: student.id, name: student.name } });
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Popular at</Text>
          <Text style={styles.title} numberOfLines={1}>{data.school || "Your school"}</Text>
        </View>
      </View>
      <View style={styles.tabs}>
        {TABS.map((item) => (
          <Pressable key={item.key} onPress={() => setTab(item.key)} style={[styles.tab, tab === item.key && styles.tabOn]}>
            <Text style={[styles.tabText, tab === item.key && styles.tabTextOn]}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      {loading ? (
        <ActivityIndicator color={colors.violet} style={{ marginTop: 24 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.page}>
          {tab === "decks" ? (
            <>
              {(data.decks || []).map((deck) => (
                <Pressable
                  key={deck.id}
                  onPress={() => goStudy("FlashcardCollection", { collection: deck, readOnly: deck.userId !== user?.id })}
                  style={styles.contentCard}
                >
                  <View style={[styles.icon, { backgroundColor: colors.mintSoft }]}>
                    <Ionicons name="layers-outline" size={18} color={colors.mint} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{deck.name}</Text>
                    <Text style={styles.cardMeta}>{deck._count?.flashcards || 0} cards · {deck.user?.name}</Text>
                  </View>
                  <Pressable
                    onPress={() => startDeckQuiz(navigation, deck, { onStart: (id) => setBusyId(id), onFinish: () => setBusyId(null) })}
                    style={styles.quizBtn}
                  >
                    {busyId === deck.id ? <ActivityIndicator size="small" color={colors.tomato} /> : <Ionicons name="play" size={14} color={colors.tomato} />}
                  </Pressable>
                </Pressable>
              ))}
              {(data.notes || []).map((note) => (
                <Pressable
                  key={note.id}
                  onPress={() => goStudy("NoteView", { noteId: note.id, readOnly: note.userId !== user?.id })}
                  style={styles.contentCard}
                >
                  <View style={[styles.icon, { backgroundColor: colors.amberSoft }]}>
                    <Ionicons name="document-text-outline" size={18} color={colors.amber} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{note.title}</Text>
                    <Text style={styles.cardMeta}>Note · {note.user?.name}</Text>
                  </View>
                </Pressable>
              ))}
              {!data.decks?.length && !data.notes?.length ? (
                <Text style={styles.empty}>No public decks or notes from this school yet.</Text>
              ) : null}
            </>
          ) : (
            <>
              {(data.leaderboard || []).map((student) => (
                <View key={student.id} style={{ marginBottom: 8 }}>
                  <StudentCard student={student} colors={colors} rank={student.rank} onPress={() => openProfile(student)} />
                </View>
              ))}
              {!data.leaderboard?.length ? <Text style={styles.empty}>No students from this school yet.</Text> : null}
            </>
          )}
        </ScrollView>
      )}
    </Screen>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    kicker: { color: colors.violet, fontSize: 11, fontWeight: "800" },
    title: { color: colors.text, fontSize: 22, fontWeight: "800" },
    tabs: { flexDirection: "row", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 4, marginBottom: 12 },
    tab: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 9 },
    tabOn: { backgroundColor: colors.violetSoft },
    tabText: { color: colors.textMuted, fontSize: 13, fontWeight: "800" },
    tabTextOn: { color: colors.violet },
    page: { paddingBottom: 28, gap: 8 },
    contentCard: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10 },
    icon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    cardTitle: { color: colors.text, fontSize: 13.5, fontWeight: "800" },
    cardMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    quizBtn: { width: 32, height: 32, borderRadius: 10, backgroundColor: colors.tomatoSoft, alignItems: "center", justifyContent: "center" },
    empty: { color: colors.textMuted, textAlign: "center", marginTop: 20 },
  });
