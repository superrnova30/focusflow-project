import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
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

const TITLES = {
  friends: "Friends",
  following: "Following",
  followers: "Followers",
};

const OWN_TABS = [
  { key: "friends", label: "Friends", icon: "people-outline" },
  { key: "following", label: "Following", icon: "person-add-outline" },
  { key: "followers", label: "Followers", icon: "heart-outline" },
];

const OTHER_TABS = [
  { key: "followers", label: "Followers", icon: "heart-outline" },
  { key: "following", label: "Following", icon: "person-add-outline" },
];

export default function FollowListScreen({ route, navigation }) {
  const { userId, mode: initialMode = "followers", name } = route.params || {};
  const { colors } = useTheme();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const wide = width >= 760;
  const styles = useMemo(() => createStyles(colors, compact, wide), [colors, compact, wide]);
  const [mode, setMode] = useState(TITLES[initialMode] ? initialMode : "followers");
  const [students, setStudents] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const isOwn = Boolean(userId && user?.id === userId);
  const tabs = isOwn ? OWN_TABS : OTHER_TABS;
  const title = TITLES[mode] || "Followers";

  useEffect(() => {
    const next = TITLES[initialMode] ? initialMode : "followers";
    setMode(next);
    setQuery("");
  }, [initialMode, userId]);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!userId) return;
    if (!silent) setLoading(true);
    try {
      const { data } = await client.get(`/students/${userId}/${mode}`);
      setStudents(data.students || []);
    } catch {
      setStudents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, mode]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const toggleFollow = async (student) => {
    if (student.id === user?.id) return;
    setBusyId(student.id);
    try {
      if (student.isFollowing) await client.delete(`/students/${student.id}/follow`);
      else await client.post(`/students/${student.id}/follow`);
      setStudents((current) =>
        current.map((row) => (row.id === student.id ? { ...row, isFollowing: !row.isFollowing } : row))
      );
      if (user?.id) refreshFriends(user.id).catch(() => {});
    } finally {
      setBusyId(null);
    }
  };

  const openFindFriends = () => {
    const names = navigation.getState?.()?.routeNames || [];
    if (names.includes("FindFriends")) navigation.navigate("FindFriends");
    else navigation.navigate("Profile", { screen: "FindFriends" });
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return students;
    return students.filter((student) => {
      const haystack = [
        student.name,
        student.schoolRecord?.name || student.school,
        student.course,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [students, query]);

  const emptyCopy = () => {
    if (query.trim()) return { title: "No matches", body: "Try a different name, school, or course." };
    if (mode === "friends") {
      return {
        title: "No friends yet",
        body: "Follow someone who follows you back and they will show up here.",
      };
    }
    if (mode === "following") {
      return {
        title: isOwn ? "You are not following anyone" : "Not following anyone yet",
        body: isOwn ? "Find classmates to follow and start a study circle." : "This student has not followed anyone yet.",
      };
    }
    return {
      title: isOwn ? "No followers yet" : "No followers yet",
      body: isOwn ? "When people follow you, they will appear in this list." : "This student does not have followers yet.",
    };
  };

  const empty = emptyCopy();

  return (
    <Screen>
      <View style={styles.shell}>
        <View style={styles.header}>
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.kicker}>Friends</Text>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {isOwn
                ? mode === "following"
                  ? "People you follow"
                  : mode === "followers"
                    ? "People who follow you"
                    : "Mutual follows"
                : name
                  ? `${name}'s ${title.toLowerCase()}`
                  : title}
            </Text>
          </View>
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{students.length}</Text>
          </View>
        </View>

        <View style={styles.tabs}>
          {tabs.map((item) => {
            const on = mode === item.key;
            return (
              <Pressable
                key={item.key}
                onPress={() => {
                  setMode(item.key);
                  setQuery("");
                }}
                style={[styles.tab, on && styles.tabOn]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Ionicons name={item.icon} size={14} color={on ? colors.violet : colors.textMuted} />
                <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.search}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search this list"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
          />
          {query ? (
            <Pressable onPress={() => setQuery("")} hitSlop={8} accessibilityLabel="Clear search">
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        {loading && !refreshing ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.violet} />
            <Text style={styles.loadingText}>Loading {title.toLowerCase()}…</Text>
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
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
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <View style={styles.emptyIcon}>
                  <Ionicons name={mode === "friends" ? "people-outline" : "person-outline"} size={22} color={colors.violet} />
                </View>
                <Text style={styles.emptyTitle}>{empty.title}</Text>
                <Text style={styles.empty}>{empty.body}</Text>
                {isOwn && !query.trim() && (mode === "friends" || mode === "following") ? (
                  <Pressable onPress={openFindFriends} style={styles.findBtn} accessibilityRole="button" accessibilityLabel="Find friends">
                    <Ionicons name="search" size={14} color="#fff" />
                    <Text style={styles.findBtnText}>Find friends</Text>
                  </Pressable>
                ) : null}
              </View>
            }
            renderItem={({ item }) => (
              <StudentCard
                student={item}
                colors={colors}
                following={item.isFollowing}
                followBusy={busyId === item.id}
                onFollow={item.id === user?.id ? undefined : () => toggleFollow(item)}
                onPress={() => navigation.navigate("StudentProfile", { userId: item.id, name: item.name })}
              />
            )}
          />
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
    title: { color: colors.text, fontSize: compact ? 20 : 22, fontWeight: "800", marginTop: 1 },
    subtitle: { color: colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 2 },
    countBadge: {
      minWidth: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: colors.violetSoft,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 8,
    },
    countText: { color: colors.violet, fontSize: 13, fontWeight: "800" },
    tabs: {
      flexDirection: "row",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      padding: 4,
      marginBottom: 10,
      gap: 4,
    },
    tab: {
      flex: 1,
      minHeight: 40,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      borderRadius: 11,
      paddingHorizontal: 4,
    },
    tabOn: { backgroundColor: colors.violetSoft },
    tabText: { color: colors.textMuted, fontSize: compact ? 11 : 12.5, fontWeight: "800" },
    tabTextOn: { color: colors.violet },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 44,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      backgroundColor: colors.surface,
      marginBottom: 10,
    },
    input: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14, fontWeight: "600", paddingVertical: 10 },
    list: { paddingBottom: 28, gap: 8, flexGrow: 1 },
    loading: { alignItems: "center", paddingTop: 36, gap: 10 },
    loadingText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
    emptyWrap: { alignItems: "center", paddingTop: 36, paddingHorizontal: 20, gap: 6 },
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
    empty: { color: colors.textMuted, textAlign: "center", fontSize: 13, lineHeight: 18, maxWidth: 300 },
    findBtn: {
      marginTop: 8,
      minHeight: 42,
      paddingHorizontal: 16,
      borderRadius: 12,
      backgroundColor: colors.tomato,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    findBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  });
