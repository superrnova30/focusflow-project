import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import StudentCard from "../components/StudentCard";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import client from "../api/client";
import { refreshFriends } from "../lib/friends";
import { schoolDisplayName } from "../lib/schools";
import { RADIUS, SPACING } from "../theme/theme";

const INITIAL_VISIBLE = 5;
const MORE_VISIBLE = 10;

function withoutSelf(list, userId) {
  return (list || []).filter((row) => row?.id && row.id !== userId);
}

function uniqueById(list) {
  const seen = new Set();
  return (list || []).filter((row) => {
    if (!row?.id || seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export default function FindFriendsScreen({ navigation }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const wide = width >= 760;
  const styles = useMemo(() => createStyles(colors, compact, wide), [colors, compact, wide]);

  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState([]);
  const [friendsOfFriends, setFriendsOfFriends] = useState([]);
  const [schoolPeople, setSchoolPeople] = useState([]);
  const [schoolLabel, setSchoolLabel] = useState(schoolDisplayName(user));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [visibleCounts, setVisibleCounts] = useState({
    results: INITIAL_VISIBLE,
    friendsOfFriends: INITIAL_VISIBLE,
    schoolPeople: INITIAL_VISIBLE,
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 280);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    setVisibleCounts({
      results: INITIAL_VISIBLE,
      friendsOfFriends: INITIAL_VISIBLE,
      schoolPeople: INITIAL_VISIBLE,
    });
  }, [debounced]);

  const patchFollow = (studentId, nextFollowing) => {
    const patch = (list) =>
      list.map((row) => (row.id === studentId ? { ...row, isFollowing: nextFollowing } : row));
    setResults((current) => patch(current));
    setFriendsOfFriends((current) => patch(current));
    setSchoolPeople((current) => patch(current));
  };

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const { data } = await client.get("/students/discover", {
        params: { q: debounced || undefined, take: 50 },
      });
      const selfId = user?.id;
      setSchoolLabel(data.school || schoolDisplayName(user) || "");
      setResults(uniqueById(withoutSelf(data.results || data.students || [], selfId)));
      setFriendsOfFriends(uniqueById(withoutSelf(data.friendsOfFriends || [], selfId)));
      setSchoolPeople(uniqueById(withoutSelf(data.schoolPeople || [], selfId)));
    } catch (e) {
      setResults([]);
      setFriendsOfFriends([]);
      setSchoolPeople([]);
      setError(e?.response?.data?.error || e?.message || "Could not load people right now.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [debounced, user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleFollow = async (student) => {
    if (!student?.id || student.id === user?.id) return;
    setBusyId(student.id);
    const nextFollowing = !student.isFollowing;
    try {
      if (student.isFollowing) await client.delete(`/students/${student.id}/follow`);
      else await client.post(`/students/${student.id}/follow`);
      patchFollow(student.id, nextFollowing);
      if (user?.id) refreshFriends(user.id).catch(() => {});
      if (!debounced) load({ silent: true });
    } catch {
      // keep current follow state
    } finally {
      setBusyId(null);
    }
  };

  const openProfile = (student) => {
    if (!student?.id || student.id === user?.id) return;
    navigation.navigate("StudentProfile", { userId: student.id, name: student.name });
  };

  const clearSearch = () => {
    setQuery("");
    setDebounced("");
  };

  const showMore = (key) => {
    setVisibleCounts((current) => ({
      ...current,
      [key]: (current[key] || INITIAL_VISIBLE) + MORE_VISIBLE,
    }));
  };

  const renderPerson = (student) => (
    <StudentCard
      key={student.id}
      student={student}
      colors={colors}
      following={Boolean(student.isFollowing)}
      followBusy={busyId === student.id}
      onFollow={() => toggleFollow(student)}
      onPress={() => openProfile(student)}
    />
  );

  const renderSection = ({
    key,
    title,
    icon,
    people,
    emptyTitle,
    emptyText,
    hideWhenEmpty = false,
  }) => {
    if (loading && !refreshing) return null;
    const list = people || [];
    if (hideWhenEmpty && !list.length) return null;

    const visible = visibleCounts[key] || INITIAL_VISIBLE;
    const shown = list.slice(0, visible);
    const remaining = Math.max(0, list.length - shown.length);
    const nextBatch = Math.min(MORE_VISIBLE, remaining);

    return (
      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <View style={[styles.sectionIcon, { backgroundColor: colors.violetSoft }]}>
            <Ionicons name={icon} size={14} color={colors.violet} />
          </View>
          <Text style={styles.sectionTitle} numberOfLines={1}>{title}</Text>
          <Text style={styles.sectionCount}>{list.length}</Text>
        </View>
        {list.length ? (
          <>
            <View style={styles.sectionBody}>{shown.map(renderPerson)}</View>
            {remaining > 0 ? (
              <Pressable
                onPress={() => showMore(key)}
                style={({ pressed }) => [
                  styles.moreBtn,
                  { borderTopColor: colors.border, backgroundColor: colors.bg },
                  pressed && styles.pressed,
                ]}
                accessibilityRole="button"
                accessibilityLabel={`See ${nextBatch} more`}
              >
                <Text style={[styles.moreBtnText, { color: colors.violet }]}>
                  See {nextBatch} more
                </Text>
                <Ionicons name="chevron-down" size={14} color={colors.violet} />
              </Pressable>
            ) : null}
          </>
        ) : (
          <View style={styles.sectionEmpty}>
            <Text style={styles.sectionEmptyTitle}>{emptyTitle}</Text>
            <Text style={styles.sectionEmptyText}>{emptyText}</Text>
          </View>
        )}
      </View>
    );
  };

  const searching = Boolean(debounced);
  const campusTitle = schoolLabel ? `People at ${schoolLabel}` : "People at your school";

  return (
    <Screen>
      <View style={styles.shell}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>Friends</Text>
            <Text style={styles.title}>Find friends</Text>
            <Text style={styles.subtitle}>Search by name, or browse friends of friends and classmates.</Text>
          </View>
        </View>

        <View style={styles.search}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="words"
            clearButtonMode="never"
          />
          {query ? (
            <Pressable onPress={clearSearch} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {loading && !refreshing ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.violet} />
            <Text style={styles.loadingText}>{searching ? "Searching…" : "Finding people…"}</Text>
          </View>
        ) : error && !results.length && !friendsOfFriends.length && !schoolPeople.length ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={28} color={colors.tomato} />
            <Text style={styles.errorTitle}>Couldn’t load people</Text>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable
              onPress={() => load()}
              style={({ pressed }) => [styles.retryBtn, { backgroundColor: colors.violet }, pressed && styles.pressed]}
            >
              <Text style={styles.retryBtnText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
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
            {searching ? (
              renderSection({
                key: "results",
                title: `Results for “${debounced}”`,
                icon: "search-outline",
                people: results,
                emptyTitle: "No students found",
                emptyText: "Try another name. Your own account is never shown here.",
              })
            ) : (
              <>
                {renderSection({
                  key: "friendsOfFriends",
                  title: "Friends of friends",
                  icon: "git-network-outline",
                  people: friendsOfFriends,
                  hideWhenEmpty: true,
                })}
                {renderSection({
                  key: "schoolPeople",
                  title: campusTitle,
                  icon: "school-outline",
                  people: schoolPeople,
                  emptyTitle: schoolLabel ? "No classmates to follow yet" : "Add your school",
                  emptyText: schoolLabel
                    ? "Everyone from your campus that you don’t already follow will appear here."
                    : "Set your school in Settings to see classmates from your campus.",
                })}
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
    shell: {
      flex: 1,
      minHeight: 0,
      maxWidth: wide ? 860 : "100%",
      width: "100%",
      alignSelf: "center",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      marginBottom: 12,
      flexShrink: 0,
    },
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
    kicker: {
      color: colors.violet,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 0.3,
      textTransform: "uppercase",
    },
    title: {
      color: colors.text,
      fontSize: compact ? 20 : 22,
      fontWeight: "800",
      marginTop: 1,
    },
    subtitle: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "600",
      marginTop: 2,
      lineHeight: 17,
    },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 46,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      backgroundColor: colors.surface,
      marginBottom: 12,
      flexShrink: 0,
    },
    input: {
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontSize: 14,
      fontWeight: "600",
      paddingVertical: 10,
    },
    scroll: {
      paddingBottom: 28,
      gap: SPACING.md,
      flexGrow: 1,
    },
    section: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 18,
      backgroundColor: colors.surface,
      overflow: "hidden",
    },
    sectionHead: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 11,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sectionIcon: {
      width: 28,
      height: 28,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    sectionTitle: {
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontSize: 14,
      fontWeight: "800",
    },
    sectionCount: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: "700",
    },
    sectionBody: {
      paddingVertical: 4,
      paddingHorizontal: 8,
      gap: 2,
    },
    sectionEmpty: {
      paddingHorizontal: 16,
      paddingVertical: 18,
      gap: 4,
    },
    sectionEmptyTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: "800",
    },
    sectionEmptyText: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: "600",
    },
    moreBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderTopWidth: 1,
      paddingVertical: 12,
    },
    moreBtnText: {
      fontSize: 13,
      fontWeight: "800",
    },
    loading: {
      alignItems: "center",
      paddingTop: 36,
      gap: 10,
    },
    loadingText: {
      color: colors.textMuted,
      fontSize: 13,
      fontWeight: "600",
    },
    errorBox: {
      alignItems: "center",
      paddingTop: 40,
      paddingHorizontal: 24,
      gap: 8,
    },
    errorTitle: {
      color: colors.text,
      fontSize: 16,
      fontWeight: "800",
    },
    errorText: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
      textAlign: "center",
      fontWeight: "600",
    },
    retryBtn: {
      marginTop: 8,
      minHeight: 42,
      borderRadius: RADIUS.md,
      paddingHorizontal: 18,
      alignItems: "center",
      justifyContent: "center",
    },
    retryBtnText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "800",
    },
    pressed: {
      opacity: 0.85,
    },
  });
