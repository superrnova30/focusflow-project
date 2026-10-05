import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen, Card } from "../components/Screen";
import { Input } from "../components/Inputs";
import UserAvatar from "../components/UserAvatar";
import { useTheme } from "../context/ThemeContext";
import { RADIUS } from "../theme/theme";
import client from "../api/client";

function formatDisplayName(name) {
  const raw = String(name || "").trim();
  if (!raw) return "Unnamed student";
  const letters = raw.replace(/[^A-Za-z]/g, "");
  const shouty = letters.length > 2 && letters === letters.toUpperCase();
  if (!shouty) return raw;
  return raw
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function firstName(name) {
  return formatDisplayName(name).split(/\s+/)[0] || "this student";
}

const isWeb = Platform.OS === "web";

// Cross-platform confirm dialog: react-native-web's Alert is a no-op, so on web
// we fall back to window.confirm to keep destructive actions safe.
function confirmDelete(message, onConfirm) {
  if (isWeb) {
    // eslint-disable-next-line no-alert
    if (window.confirm(message)) onConfirm();
    return;
  }
  Alert.alert("Are you sure?", message, [
    { text: "Cancel", style: "cancel" },
    { text: "Delete", style: "destructive", onPress: onConfirm },
  ]);
}

const TABS = [
  { key: "cards", label: "Cards", icon: "layers" },
  { key: "notes", label: "Notes", icon: "document-text" },
  { key: "coach", label: "AI Coach", icon: "sparkles" },
];

export default function AdminContentScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const { width } = useWindowDimensions();
  const isWide = width >= 700;

  const [tab, setTab] = useState("cards");
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  // Cards
  const [collections, setCollections] = useState([]);
  const [cardsSearch, setCardsSearch] = useState("");
  const [expandedCollection, setExpandedCollection] = useState(null);

  // Notes
  const [notes, setNotes] = useState([]);
  const [notesSearch, setNotesSearch] = useState("");

  // Coach
  const [insights, setInsights] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [generatingCoach, setGeneratingCoach] = useState(false);
  const [studentQuery, setStudentQuery] = useState("");

  const fetchStats = useCallback(async () => {
    try {
      const { data } = await client.get("/admin/content-stats");
      setStats(data.stats || null);
    } catch (e) {
      // non-fatal
    }
  }, []);

  const fetchCollections = useCallback(async (search) => {
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : "";
      const { data } = await client.get(`/admin/flashcards${q}`);
      setCollections(data.collections || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, []);

  const fetchNotes = useCallback(async (search) => {
    try {
      const q = search ? `?search=${encodeURIComponent(search)}` : "";
      const { data } = await client.get(`/admin/notes${q}`);
      setNotes(data.notes || []);
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  }, []);

  const fetchInsights = useCallback(async () => {
    try {
      const { data } = await client.get("/admin/coach-insights");
      setInsights(data.insights || []);
    } catch (e) {
      // non-fatal
    }
  }, []);

  const fetchStudents = useCallback(async () => {
    try {
      const { data } = await client.get("/admin/users?role=STUDENT");
      setStudents(data.users || []);
    } catch (e) {
      // non-fatal
    }
  }, []);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([
        fetchStats(),
        fetchCollections(cardsSearch),
        fetchNotes(notesSearch),
        fetchInsights(),
        fetchStudents(),
      ]);
    } finally {
      setLoading(false);
    }
  }, [fetchStats, fetchCollections, fetchNotes, fetchInsights, fetchStudents, cardsSearch, notesSearch]);

  useFocusEffect(
    useCallback(() => {
      refreshAll();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const toggleCollection = async (collection) => {
    if (expandedCollection === collection.id) {
      setExpandedCollection(null);
      return;
    }
    setExpandedCollection(collection.id);
    try {
      const { data } = await client.get(`/admin/flashcards/collections/${collection.id}`);
      setCollections((prev) =>
        prev.map((c) => (c.id === collection.id ? { ...c, flashcards: data.collection.flashcards } : c))
      );
    } catch (e) {
      Alert.alert("Error", e.message);
    }
  };

  const deleteCollection = (collection) => {
    confirmDelete(`Delete "${collection.name}" and all its cards?`, async () => {
      try {
        await client.delete(`/admin/flashcards/collections/${collection.id}`);
        await Promise.all([fetchCollections(cardsSearch), fetchStats()]);
      } catch (e) {
        Alert.alert("Error", e.message);
      }
    });
  };

  const deleteCard = (card) => {
    confirmDelete("Delete this flashcard?", async () => {
      try {
        await client.delete(`/admin/flashcards/${card.id}`);
        await Promise.all([fetchCollections(cardsSearch), fetchStats()]);
      } catch (e) {
        Alert.alert("Error", e.message);
      }
    });
  };

  const deleteNote = (note) => {
    confirmDelete(`Delete "${note.title}"?`, async () => {
      try {
        await client.delete(`/admin/notes/${note.id}`);
        await Promise.all([fetchNotes(notesSearch), fetchStats()]);
      } catch (e) {
        Alert.alert("Error", e.message);
      }
    });
  };

  const generateCoach = async () => {
    if (!selectedStudent) return;
    setGeneratingCoach(true);
    try {
      const { data } = await client.post(`/admin/coach/${selectedStudent.id}`, {}, { timeout: 120000 });
      if (data.insight) {
        setInsights((prev) => [
          {
            id: `local-${Date.now()}`,
            summary: data.insight.summary,
            data: data.insight,
            createdAt: new Date().toISOString(),
            user: { name: selectedStudent.name, email: selectedStudent.email },
          },
          ...prev,
        ]);
      }
      await fetchStats();
    } catch (e) {
      Alert.alert("Error", e.message || "Could not generate a coach insight.");
    } finally {
      setGeneratingCoach(false);
    }
  };

  const blockCount = (note) => (Array.isArray(note.contentJson) ? note.contentJson.length : 0);
  const filteredStudents = students.filter((s) => {
    if (!studentQuery.trim()) return true;
    const q = studentQuery.toLowerCase();
    return (s.name || "").toLowerCase().includes(q) || (s.email || "").toLowerCase().includes(q);
  });

  const renderStatPill = (icon, value, label, color) => (
    <View style={[styles.statPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.statIconWrap, { backgroundColor: color + "22" }]}>
        <Ionicons name={icon} size={16} color={color} />
      </View>
      <View>
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statLabel}>{label}</Text>
      </View>
    </View>
  );

  const renderCardsTab = () => (
    <>
      <View style={styles.searchField}>
        <Input
          value={cardsSearch}
          onChangeText={(t) => {
            setCardsSearch(t);
            fetchCollections(t);
          }}
          placeholder="Search card collections..."
          compact
          style={styles.searchInput}
        />
      </View>

      <Text style={styles.sectionLabel}>COLLECTIONS ({collections.length})</Text>
      {collections.length === 0 && !loading && (
        <Text style={styles.muted}>No flashcard collections found.</Text>
      )}
      {collections.map((c) => {
        const open = expandedCollection === c.id;
        const cards = c.flashcards || [];
        const cardCount = c._count?.flashcards ?? cards.length;
        return (
          <Card key={c.id} style={styles.itemCard}>
            <Pressable onPress={() => toggleCollection(c)} style={styles.itemHeader}>
              <View style={[styles.itemIcon, { backgroundColor: colors.mintSoft }]}>
                <Ionicons name="layers" size={18} color={colors.mint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{c.name}</Text>
                <Text style={styles.itemMeta}>
                  {cardCount} cards · {c.user?.name || "Unknown"}
                </Text>
              </View>
              <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
            </Pressable>

            {open && (
              <View style={styles.expandedBody}>
                {cards.length === 0 && <Text style={styles.muted}>No cards to show.</Text>}
                {cards.map((card, idx) => (
                  <View key={card.id} style={[styles.cardRow, { borderColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.cardFront}>
                        #{idx + 1} {card.front}
                      </Text>
                      <Text style={styles.cardBack}>{card.back}</Text>
                    </View>
                    <Pressable onPress={() => deleteCard(card)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={17} color={colors.tomato} />
                    </Pressable>
                  </View>
                ))}
                <Pressable onPress={() => deleteCollection(c)} style={styles.dangerLink}>
                  <Ionicons name="trash-outline" size={15} color={colors.tomato} />
                  <Text style={styles.dangerText}>Delete collection</Text>
                </Pressable>
              </View>
            )}
          </Card>
        );
      })}
    </>
  );

  const renderNotesTab = () => (
    <>
      <View style={styles.searchField}>
        <Input
          value={notesSearch}
          onChangeText={(t) => {
            setNotesSearch(t);
            fetchNotes(t);
          }}
          placeholder="Search notes by title..."
          compact
          style={styles.searchInput}
        />
      </View>

      <Text style={styles.sectionLabel}>NOTES ({notes.length})</Text>
      {notes.length === 0 && !loading && <Text style={styles.muted}>No notes found.</Text>}
      {notes.map((n) => (
        <Card key={n.id} style={styles.itemCard}>
          <View style={styles.itemHeader}>
            <View style={[styles.itemIcon, { backgroundColor: n.source === "ai" ? colors.violetSoft : colors.amberSoft }]}>
              <Ionicons name={n.source === "ai" ? "sparkles" : "document-text"} size={18} color={n.source === "ai" ? colors.violet : colors.amber} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{n.title}</Text>
              <Text style={styles.itemMeta}>
                {n.source === "ai" ? "AI" : "Manual"} · {blockCount(n)} blocks · {n.user?.name || "Unknown"}
              </Text>
            </View>
            <Pressable onPress={() => deleteNote(n)} hitSlop={8}>
              <Ionicons name="trash-outline" size={18} color={colors.tomato} />
            </Pressable>
          </View>
          {n.aiSummary ? <Text style={styles.noteSummary}>{n.aiSummary}</Text> : null}
        </Card>
      ))}
    </>
  );

  const renderCoachTab = () => {
    const selectedId = selectedStudent?.id;
    const orderedStudents = [
      ...filteredStudents.filter((s) => s.id === selectedId),
      ...filteredStudents.filter((s) => s.id !== selectedId),
    ];
    const visibleStudents = orderedStudents.slice(0, 8);
    const hiddenCount = Math.max(0, filteredStudents.length - visibleStudents.length);

    return (
      <>
        <Card style={styles.itemCard}>
          <View style={styles.coachHead}>
            <View style={[styles.coachHeadIcon, { backgroundColor: colors.violetSoft }]}>
              <Ionicons name="sparkles" size={18} color={colors.violet} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.coachTitle}>Generate a coach insight</Text>
              <Text style={styles.coachHint}>
                Choose a student, then analyze their study patterns.
              </Text>
            </View>
          </View>

          <View style={styles.coachSearch}>
            <Ionicons name="search-outline" size={16} color={colors.textMuted} />
            <TextInput
              value={studentQuery}
              onChangeText={setStudentQuery}
              placeholder="Search by name or email"
              placeholderTextColor={colors.textMuted}
              style={styles.coachSearchInput}
              autoCorrect={false}
              autoCapitalize="none"
            />
            {studentQuery.trim() ? (
              <Pressable onPress={() => setStudentQuery("")} hitSlop={8} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.studentList}>
            {visibleStudents.length === 0 ? (
              <Text style={styles.muted}>
                {students.length === 0 ? "No students to show yet." : "No students match that search."}
              </Text>
            ) : (
              visibleStudents.map((s) => {
                const active = selectedId === s.id;
                const displayName = formatDisplayName(s.name);
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => setSelectedStudent(active ? null : s)}
                    style={[styles.studentRow, active && styles.studentRowActive]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Select ${displayName}`}
                  >
                    <UserAvatar user={s} size={36} />
                    <View style={styles.studentCopy}>
                      <Text style={[styles.studentName, active && styles.studentNameActive]} numberOfLines={1}>
                        {displayName}
                      </Text>
                      <Text style={styles.studentEmail} numberOfLines={1}>
                        {s.email || "No email on file"}
                      </Text>
                    </View>
                    <View style={[styles.studentCheck, active && styles.studentCheckOn]}>
                      {active ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
          {hiddenCount > 0 ? (
            <Text style={styles.studentMore}>
              {hiddenCount} more — keep typing to narrow the list
            </Text>
          ) : null}

          <Pressable
            onPress={generateCoach}
            disabled={!selectedStudent || generatingCoach}
            accessibilityLabel={
              selectedStudent
                ? `Generate insight for ${formatDisplayName(selectedStudent.name)}`
                : "Select a student to generate an insight"
            }
            style={({ pressed }) => [
              styles.coachCta,
              !selectedStudent && styles.coachCtaDisabled,
              pressed && selectedStudent && !generatingCoach && { opacity: 0.86 },
            ]}
          >
            {generatingCoach ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <Ionicons
                  name="sparkles"
                  size={16}
                  color={selectedStudent ? "#FFFFFF" : colors.textMuted}
                />
                <Text style={[styles.coachCtaText, !selectedStudent && styles.coachCtaTextDisabled]}>
                  {selectedStudent
                    ? `Generate insight for ${firstName(selectedStudent.name)}`
                    : "Select a student to continue"}
                </Text>
              </>
            )}
          </Pressable>
        </Card>

        <Text style={styles.sectionHeading}>Recent insights ({insights.length})</Text>
        {insights.length === 0 && !loading ? (
          <View style={styles.emptyInsights}>
            <View style={[styles.emptyInsightsIcon, { backgroundColor: colors.violetSoft }]}>
              <Ionicons name="sparkles-outline" size={18} color={colors.violet} />
            </View>
            <Text style={styles.emptyInsightsTitle}>No insights yet</Text>
            <Text style={styles.emptyInsightsCopy}>
              Pick a student above to generate the first coach insight.
            </Text>
          </View>
        ) : null}
        {insights.map((ins) => {
          const d = ins.data || {};
          return (
            <Card key={ins.id} style={styles.itemCard}>
              <View style={styles.itemHeader}>
                <UserAvatar user={ins.user} size={40} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.itemTitle}>{formatDisplayName(ins.user?.name) || "Student"}</Text>
                  <Text style={styles.itemMeta}>{new Date(ins.createdAt).toLocaleString()}</Text>
                </View>
              </View>
              {!!d.summary && <Text style={styles.noteSummary}>{d.summary}</Text>}
              {Array.isArray(d.strengths) && d.strengths.length > 0 && (
                <View style={styles.insightBlock}>
                  <Text style={styles.insightLabel}>Strengths</Text>
                  {d.strengths.map((s, i) => (
                    <Text key={i} style={styles.insightPoint}>• {s}</Text>
                  ))}
                </View>
              )}
              {Array.isArray(d.recommendations) && d.recommendations.length > 0 && (
                <View style={styles.insightBlock}>
                  <Text style={styles.insightLabel}>Recommendations</Text>
                  {d.recommendations.map((s, i) => (
                    <Text key={i} style={styles.insightPoint}>• {s}</Text>
                  ))}
                </View>
              )}
            </Card>
          );
        })}
      </>
    );
  };

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 12, paddingBottom: 48 }}
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => navigation.goBack()}
            style={[styles.backBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={18} color={colors.text} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.header}>Study Content</Text>
            <Text style={styles.subtitle}>Manage student Cards, Notes, and AI Coach insights.</Text>
          </View>
        </View>

        {stats && (
          <View style={[styles.statsRow, isWide && styles.statsRowWide]}>
            {renderStatPill("layers", stats.totalFlashcards, "Cards", colors.mint)}
            {renderStatPill("albums", stats.totalCollections, "Decks", colors.violet)}
            {renderStatPill("document-text", stats.totalNotes, "Notes", colors.amber)}
            {renderStatPill("sparkles", stats.totalCoachInsights, "Coach", colors.tomato)}
          </View>
        )}

        <View style={[styles.tabBar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[styles.tabBtn, active && { backgroundColor: colors.violetSoft }]}
              >
                <Ionicons name={t.icon} size={16} color={active ? colors.violet : colors.textMuted} />
                <Text style={[styles.tabLabel, { color: active ? colors.violet : colors.textMuted }]}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.violet} style={{ marginTop: 24 }} />
        ) : tab === "cards" ? (
          renderCardsTab()
        ) : tab === "notes" ? (
          renderNotesTab()
        ) : (
          renderCoachTab()
        )}
      </ScrollView>
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    header: { color: colors.text, fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
    subtitle: { color: colors.textMuted, fontSize: 12.5, marginTop: 2 },

    statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 },
    statsRowWide: { gap: 12 },
    statPill: {
      flexGrow: 1,
      flexBasis: 140,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderRadius: 14,
      paddingVertical: 10,
      paddingHorizontal: 12,
    },
    statIconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    statValue: { color: colors.text, fontSize: 16, fontWeight: "800" },
    statLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "600" },

    tabBar: {
      flexDirection: "row",
      borderWidth: 1,
      borderRadius: 14,
      padding: 4,
      gap: 4,
      marginBottom: 16,
    },
    tabBtn: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      borderRadius: 10,
    },
    tabLabel: { fontSize: 13, fontWeight: "700" },

    searchField: { marginBottom: 4 },
    searchInput: { marginTop: 0, marginBottom: 0, height: 40 },
    sectionLabel: { color: colors.textMuted, fontSize: 11.5, fontWeight: "700", letterSpacing: 0.5, marginTop: 8, marginBottom: 8 },
    muted: { color: colors.textMuted, fontSize: 13, marginBottom: 8 },

    itemCard: { marginBottom: 10 },
    itemHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
    itemIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    itemTitle: { color: colors.text, fontSize: 14.5, fontWeight: "700" },
    itemMeta: { color: colors.textMuted, fontSize: 11.5, marginTop: 2 },

    expandedBody: { marginTop: 12, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 },
    cardRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      paddingVertical: 8,
      borderBottomWidth: 1,
    },
    cardFront: { color: colors.text, fontSize: 13.5, fontWeight: "600", lineHeight: 19 },
    cardBack: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
    dangerLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
    dangerText: { color: colors.tomato, fontSize: 12.5, fontWeight: "700" },

    noteSummary: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 10 },

    coachHead: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 14 },
    coachHeadIcon: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    coachTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
    coachHint: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginTop: 2 },
    coachSearch: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    coachSearchInput: {
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontSize: 14,
      fontWeight: "600",
      paddingVertical: 10,
      ...(Platform.OS === "web" ? { outlineStyle: "none" } : null),
    },
    studentList: { marginTop: 12, gap: 8 },
    studentRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      minHeight: 56,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    studentRowActive: {
      borderColor: colors.violet,
      backgroundColor: colors.violetSoft,
    },
    studentCopy: { flex: 1, minWidth: 0 },
    studentName: { color: colors.text, fontSize: 14, fontWeight: "700" },
    studentNameActive: { color: colors.violet },
    studentEmail: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    studentCheck: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.surface,
    },
    studentCheckOn: {
      borderColor: colors.violet,
      backgroundColor: colors.violet,
    },
    studentMore: { color: colors.textMuted, fontSize: 12, marginTop: 8, fontWeight: "600" },
    coachCta: {
      marginTop: 14,
      minHeight: 48,
      borderRadius: RADIUS.md,
      backgroundColor: colors.tomato,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingHorizontal: 14,
    },
    coachCtaDisabled: {
      backgroundColor: colors.violetSoft,
    },
    coachCtaText: { color: "#FFFFFF", fontSize: 13.5, fontWeight: "800" },
    coachCtaTextDisabled: { color: colors.textMuted },
    sectionHeading: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "700",
      marginTop: 8,
      marginBottom: 10,
    },
    emptyInsights: {
      alignItems: "center",
      paddingVertical: 22,
      paddingHorizontal: 16,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      marginBottom: 10,
    },
    emptyInsightsIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    emptyInsightsTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
    emptyInsightsCopy: {
      color: colors.textMuted,
      fontSize: 12.5,
      lineHeight: 18,
      textAlign: "center",
      marginTop: 4,
      maxWidth: 280,
    },

    insightBlock: { marginTop: 10 },
    insightLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4, marginBottom: 4 },
    insightPoint: { color: colors.text, fontSize: 12.5, lineHeight: 18 },
  });
