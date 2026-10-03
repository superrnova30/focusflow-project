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
import UserAvatar from "../components/UserAvatar";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import client from "../api/client";
import { RADIUS, SPACING } from "../theme/theme";

export default function StudentProfileScreen({ route, navigation }) {
  const { userId, name: initialName } = route.params || {};
  const { colors } = useTheme();
  const { user: me } = useAuth();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;
  const compact = width < 390;
  const styles = useMemo(() => createStyles(colors, isWide, compact), [colors, isWide, compact]);

  const [profile, setProfile] = useState(null);
  const [publicNotes, setPublicNotes] = useState([]);
  const [publicCollections, setPublicCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const fetchProfile = useCallback(async (silent = false) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    setError("");
    try {
      const { data } = await client.get(`/students/${userId}/profile`);
      setProfile(data.profile);
      setPublicNotes(data.publicNotes || []);
      setPublicCollections(data.publicCollections || []);
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Could not load profile.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      fetchProfile(true);
    }, [fetchProfile])
  );

  const isOwnProfile = profile?.id === me?.id;

  if (loading && !profile) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <ActivityIndicator color={colors.violet} size="large" />
          <Text style={styles.centerText}>Loading profile…</Text>
        </View>
      </Screen>
    );
  }

  if (error && !profile) {
    return (
      <Screen>
        <View style={styles.centerState}>
          <Ionicons name="person-outline" size={32} color={colors.textMuted} />
          <Text style={styles.errorTitle}>{error}</Text>
          <Pressable onPress={() => fetchProfile()} style={[styles.retryBtn, { backgroundColor: colors.tomato }]}>
            <Text style={styles.retryBtnText}>Try again</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchProfile(true); }} tintColor={colors.violet} />
        }
      >
        <View style={styles.page}>
          <View style={[styles.heroCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <UserAvatar user={profile} size={72} />
            <Text style={styles.name}>{profile?.name || initialName || "Student"}</Text>
            {isOwnProfile && (
              <View style={[styles.youPill, { backgroundColor: colors.violetSoft }]}>
                <Text style={[styles.youPillText, { color: colors.violet }]}>Your profile</Text>
              </View>
            )}
            <View style={styles.metaRow}>
              {!!profile?.course && (
                <View style={styles.metaItem}>
                  <Ionicons name="school-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.metaText}>{profile.course}</Text>
                </View>
              )}
              {!!profile?.yearLevel && (
                <View style={styles.metaItem}>
                  <Ionicons name="layers-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.metaText}>{profile.yearLevel}</Text>
                </View>
              )}
              {!!profile?.section && (
                <View style={styles.metaItem}>
                  <Ionicons name="people-outline" size={14} color={colors.textMuted} />
                  <Text style={styles.metaText}>{profile.section}</Text>
                </View>
              )}
            </View>
            <View style={styles.statsRow}>
              <View style={[styles.statBox, { backgroundColor: colors.bg }]}>
                <Text style={[styles.statValue, { color: colors.tomato }]}>{profile?.xp ?? 0}</Text>
                <Text style={styles.statLabel}>XP</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.bg }]}>
                <Text style={[styles.statValue, { color: colors.amber }]}>{profile?.streakCount ?? 0}</Text>
                <Text style={styles.statLabel}>Day streak</Text>
              </View>
              <View style={[styles.statBox, { backgroundColor: colors.bg }]}>
                <Text style={[styles.statValue, { color: colors.violet }]}>{profile?.currentLevel ?? 1}</Text>
                <Text style={styles.statLabel}>Level</Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionLabel}>Public notes ({publicNotes.length})</Text>
          {publicNotes.length === 0 ? (
            <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={styles.emptyText}>
                {isOwnProfile
                  ? "You have not shared any notes yet. Edit a note and set visibility to Public."
                  : "This student has not shared any public notes."}
              </Text>
            </View>
          ) : (
            publicNotes.map((note) => (
              <Pressable
                key={note.id}
                onPress={() => navigation.navigate("NoteView", { noteId: note.id, readOnly: true })}
                style={({ pressed }) => [styles.contentRow, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}
              >
                <View style={[styles.rowIcon, { backgroundColor: colors.amberSoft }]}>
                  <Ionicons name="document-text-outline" size={18} color={colors.amber} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={2}>{note.title}</Text>
                  {!!note.aiSummary && (
                    <Text style={styles.rowPreview} numberOfLines={2}>{note.aiSummary}</Text>
                  )}
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))
          )}

          <Text style={[styles.sectionLabel, { marginTop: SPACING.lg }]}>Public flashcard decks ({publicCollections.length})</Text>
          {publicCollections.length === 0 ? (
            <View style={[styles.emptyCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={styles.emptyText}>
                {isOwnProfile
                  ? "You have not shared any flashcard collections yet. Open a collection and set visibility to Public."
                  : "This student has not shared any public flashcard decks."}
              </Text>
            </View>
          ) : (
            publicCollections.map((collection) => (
              <Pressable
                key={collection.id}
                onPress={() => navigation.navigate("FlashcardCollection", { collection, readOnly: true })}
                style={({ pressed }) => [styles.contentRow, { backgroundColor: colors.surface, borderColor: colors.border }, pressed && styles.pressed]}
              >
                <View style={[styles.rowIcon, { backgroundColor: colors.violetSoft }]}>
                  <Ionicons name="albums-outline" size={18} color={colors.violet} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle} numberOfLines={2}>{collection.name}</Text>
                  <Text style={styles.rowPreview}>{collection._count?.flashcards || 0} cards</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors, isWide, compact) =>
  StyleSheet.create({
    scroll: { paddingTop: SPACING.md, paddingBottom: SPACING.xl * 2 },
    page: { width: "100%", maxWidth: isWide ? 720 : 520, alignSelf: "center" },
    heroCard: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      alignItems: "center",
      marginBottom: SPACING.lg,
    },
    name: {
      color: colors.text,
      fontSize: compact ? 22 : 24,
      fontWeight: "900",
      marginTop: SPACING.md,
      textAlign: "center",
    },
    youPill: {
      marginTop: 8,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: RADIUS.pill,
    },
    youPillText: { fontSize: 11, fontWeight: "800" },
    metaRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      gap: SPACING.md,
      marginTop: SPACING.md,
    },
    metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
    metaText: { color: colors.textMuted, fontSize: 12.5, fontWeight: "600" },
    statsRow: {
      flexDirection: "row",
      gap: SPACING.sm,
      marginTop: SPACING.lg,
      width: "100%",
    },
    statBox: {
      flex: 1,
      borderRadius: RADIUS.md,
      paddingVertical: SPACING.md,
      alignItems: "center",
    },
    statValue: { fontSize: 20, fontWeight: "900" },
    statLabel: { color: colors.textMuted, fontSize: 11, fontWeight: "600", marginTop: 2 },
    sectionLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: SPACING.sm,
    },
    contentRow: {
      flexDirection: "row",
      alignItems: "center",
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.md,
      marginBottom: SPACING.sm,
      gap: SPACING.md,
    },
    rowIcon: {
      width: 40,
      height: 40,
      borderRadius: RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
    },
    rowBody: { flex: 1, minWidth: 0 },
    rowTitle: { color: colors.text, fontSize: 15, fontWeight: "800", lineHeight: 20 },
    rowPreview: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
    emptyCard: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      marginBottom: SPACING.sm,
    },
    emptyText: { color: colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: "center" },
    centerState: { flex: 1, alignItems: "center", justifyContent: "center", gap: SPACING.md, padding: SPACING.lg },
    centerText: { color: colors.textMuted, fontSize: 14 },
    errorTitle: { color: colors.text, fontSize: 15, fontWeight: "700", textAlign: "center" },
    retryBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: RADIUS.md, marginTop: SPACING.sm },
    retryBtnText: { color: "#fff", fontWeight: "800" },
    pressed: { opacity: 0.82 },
  });
