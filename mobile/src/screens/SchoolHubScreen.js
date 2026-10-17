import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useWindowDimensions,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import StudentCard from "../components/StudentCard";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import client from "../api/client";
import { startDeckQuiz } from "../lib/publicStudy";
import SchoolLogo from "../components/SchoolLogo";
import { schoolTypeLabel } from "../lib/schools";

const TABS = [
  { key: "decks", label: "Study", icon: "albums-outline" },
  { key: "leaderboard", label: "People", icon: "trophy-outline" },
];

export default function SchoolHubScreen({ route, navigation }) {
  const { school: initialSchool, schoolId: initialSchoolId } = route.params || {};
  const { colors } = useTheme();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 400;
  const wide = width >= 760;
  const styles = useMemo(() => createStyles(colors, compact, wide), [colors, compact, wide]);
  const [tab, setTab] = useState("decks");
  const [data, setData] = useState({
    school: initialSchool || "",
    schoolRecord: null,
    decks: [],
    notes: [],
    leaderboard: [],
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data: payload } = await client.get("/students/school", {
        params: {
          name: initialSchool || undefined,
          schoolId: initialSchoolId || undefined,
        },
      });
      setData(payload);
    } catch {
      setData({
        school: initialSchool || user?.school || "",
        schoolRecord: user?.schoolRecord || null,
        decks: [],
        notes: [],
        leaderboard: [],
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [initialSchool, initialSchoolId, user?.school, user?.schoolRecord]);

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

  const openSettings = () => {
    const names = navigation.getState?.()?.routeNames || [];
    if (names.includes("Settings")) {
      navigation.navigate("Settings");
      return;
    }
    navigation.navigate("Profile", { screen: "Settings" });
  };

  const schoolName = data.schoolRecord?.name || data.school;
  const location = String(data.schoolRecord?.location || "").trim();
  const schoolMeta = [
    location && !/^unknown( location)?$/i.test(location) ? location : null,
    data.schoolRecord?.typeLabel || schoolTypeLabel(data.schoolRecord?.type),
  ].filter(Boolean).join(" · ");
  const studentCount = data.schoolRecord?.studentCount || data.leaderboard?.length || 0;
  const deckCount = data.decks?.length || 0;
  const noteCount = data.notes?.length || 0;

  const emptyState = (icon, title, copy, action) => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={22} color={colors.violet} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.empty}>{copy}</Text>
      {action}
    </View>
  );

  const renderStat = (value, label) => (
    <View style={styles.statChip}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );

  return (
    <Screen>
      <View style={styles.shell}>
      <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>Campus hub</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {schoolName || "Your school"}
            </Text>
          </View>
        </View>

        <View style={styles.hero}>
          <SchoolLogo school={data.schoolRecord} size={compact ? 52 : 58} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.heroTitle} numberOfLines={2}>{schoolName || "Select your school"}</Text>
            <Text style={styles.heroMeta} numberOfLines={2}>
              {schoolMeta || (schoolName ? "Browse decks and classmates from this campus" : "Add a school in Settings to open your campus hub")}
            </Text>
          </View>
        </View>

        {schoolName && !(loading && !refreshing) ? (
          <View style={styles.statsRow}>
            {renderStat(studentCount, studentCount === 1 ? "student" : "students")}
            {renderStat(deckCount, deckCount === 1 ? "deck" : "decks")}
            {renderStat(noteCount, noteCount === 1 ? "note" : "notes")}
      </View>
        ) : null}

      <View style={styles.tabs}>
          {TABS.map((item) => {
            const on = tab === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => setTab(item.key)}
                style={[styles.tab, on && styles.tabOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Ionicons name={item.icon} size={15} color={on ? colors.violet : colors.textMuted} />
                <Text style={[styles.tabText, on && styles.tabTextOn]}>{item.label}</Text>
          </Pressable>
            );
          })}
        </View>

        {loading && !refreshing ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.violet} />
            <Text style={styles.loadingText}>Loading campus…</Text>
      </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.page}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true);
                  load({ silent: true });
                }}
                tintColor={colors.violet}
              />
            }
          >
            {!schoolName
              ? emptyState(
                "school-outline",
                "No school selected",
                "Choose your campus in Settings to see classmates, decks, and notes.",
                <Pressable onPress={openSettings} style={styles.ctaBtn}>
                  <Text style={styles.ctaText}>Select your school</Text>
                </Pressable>
              )
              : tab === "decks" ? (
                !data.decks?.length && !data.notes?.length
                  ? emptyState("book-outline", "No public study yet", "When classmates share decks or notes, they will show up here.")
                  : (
                    <>
                      <Text style={styles.sectionTitle}>Popular decks</Text>
                      {(data.decks || []).length ? (
                        <View style={styles.grid}>
              {(data.decks || []).map((deck) => (
                            <View key={deck.id} style={styles.contentCard}>
                <Pressable
                  onPress={() => goStudy("FlashcardCollection", { collection: deck, readOnly: deck.userId !== user?.id })}
                                style={styles.contentMain}
                                accessibilityRole="button"
                                accessibilityLabel={`Open ${deck.name}`}
                >
                  <View style={[styles.icon, { backgroundColor: colors.mintSoft }]}>
                    <Ionicons name="layers-outline" size={18} color={colors.mint} />
                  </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{deck.name}</Text>
                                  <Text style={styles.cardMeta} numberOfLines={1}>
                                    {deck._count?.flashcards || 0} cards · {deck.user?.name || "Student"}
                                  </Text>
                  </View>
                              </Pressable>
                  <Pressable
                    onPress={() => startDeckQuiz(navigation, deck, { onStart: (id) => setBusyId(id), onFinish: () => setBusyId(null) })}
                    style={styles.quizBtn}
                                accessibilityRole="button"
                                accessibilityLabel={`Quiz ${deck.name}`}
                  >
                                {busyId === deck.id
                                  ? <ActivityIndicator size="small" color={colors.tomato} />
                                  : <Ionicons name="play" size={14} color={colors.tomato} />}
                  </Pressable>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.inlineEmpty}>No public decks from this school yet.</Text>
                      )}

                      <Text style={[styles.sectionTitle, { marginTop: 18 }]}>Shared notes</Text>
                      {(data.notes || []).length ? (
                        <View style={styles.grid}>
              {(data.notes || []).map((note) => (
                <Pressable
                  key={note.id}
                  onPress={() => goStudy("NoteView", { noteId: note.id, readOnly: note.userId !== user?.id })}
                  style={styles.contentCard}
                              accessibilityRole="button"
                              accessibilityLabel={`Open ${note.title}`}
                >
                  <View style={[styles.icon, { backgroundColor: colors.amberSoft }]}>
                    <Ionicons name="document-text-outline" size={18} color={colors.amber} />
                  </View>
                              <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{note.title}</Text>
                                <Text style={styles.cardMeta} numberOfLines={1}>Note · {note.user?.name || "Student"}</Text>
                  </View>
                              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                </Pressable>
              ))}
                        </View>
                      ) : (
                        <Text style={styles.inlineEmpty}>No public notes from this school yet.</Text>
                      )}
                    </>
                  )
          ) : (
            <>
                  <Text style={styles.sectionTitle}>Campus leaderboard</Text>
              {(data.leaderboard || []).map((student) => (
                    <StudentCard
                      key={student.id}
                      student={student}
                      colors={colors}
                      rank={student.rank}
                      onPress={() => openProfile(student)}
                    />
                  ))}
                  {!data.leaderboard?.length
                    ? emptyState("people-outline", "No classmates yet", "Students linked to this school will appear here.")
                    : null}
            </>
          )}
        </ScrollView>
      )}
      </View>
    </Screen>
  );
}

const createStyles = (colors, compact, wide) =>
  StyleSheet.create({
    shell: { flex: 1, minHeight: 0, maxWidth: wide ? 860 : "100%", width: "100%", alignSelf: "center" },
    header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12, flexShrink: 0 },
    backBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    headerCopy: { flex: 1, minWidth: 0 },
    kicker: { color: colors.violet, fontSize: 11, fontWeight: "800", letterSpacing: 0.3, textTransform: "uppercase" },
    headerTitle: { color: colors.text, fontSize: compact ? 20 : 22, fontWeight: "800", marginTop: 1 },
    hero: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      padding: 14,
      marginBottom: 10,
    },
    heroTitle: { color: colors.text, fontSize: compact ? 16 : 18, fontWeight: "800" },
    heroMeta: { color: colors.textMuted, fontSize: 12.5, marginTop: 3, lineHeight: 18, fontWeight: "600" },
    statsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
    statChip: {
      flex: 1,
      backgroundColor: colors.violetSoft,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 8,
      alignItems: "center",
    },
    statValue: { color: colors.text, fontSize: 16, fontWeight: "800" },
    statLabel: { color: colors.violet, fontSize: 11, fontWeight: "700", marginTop: 2, textTransform: "lowercase" },
    tabs: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 4,
      marginBottom: 12,
      gap: 4,
      flexShrink: 0,
    },
    tab: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 9,
      borderRadius: 11,
      minHeight: 40,
    },
    tabOn: { backgroundColor: colors.violetSoft },
    tabText: { color: colors.textMuted, fontSize: compact ? 12 : 13, fontWeight: "800" },
    tabTextOn: { color: colors.violet },
    scroll: { flex: 1, minHeight: 0 },
    page: { paddingBottom: 40, gap: 8 },
    sectionTitle: { color: colors.text, fontSize: 14, fontWeight: "800", marginBottom: 2, marginTop: 2 },
    grid: { gap: 8 },
    contentCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingVertical: 8,
      paddingLeft: 8,
      paddingRight: 10,
      minHeight: 64,
    },
    contentMain: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 4,
      paddingHorizontal: 4,
    },
    icon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    cardTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
    cardMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2, fontWeight: "600" },
    quizBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      backgroundColor: colors.tomatoSoft,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    loading: { alignItems: "center", paddingTop: 36, gap: 10 },
    loadingText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
    emptyState: { alignItems: "center", paddingVertical: 36, paddingHorizontal: 16, gap: 6 },
    emptyIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: colors.violetSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 4,
    },
    emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "800", textAlign: "center" },
    empty: { color: colors.textMuted, textAlign: "center", fontSize: 13, lineHeight: 18, maxWidth: 320 },
    inlineEmpty: { color: colors.textMuted, fontSize: 12.5, fontWeight: "600", paddingHorizontal: 4 },
    ctaBtn: {
      marginTop: 8,
      minHeight: 42,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: colors.tomato,
      alignItems: "center",
      justifyContent: "center",
    },
    ctaText: { color: "#fff", fontWeight: "800" },
  });
