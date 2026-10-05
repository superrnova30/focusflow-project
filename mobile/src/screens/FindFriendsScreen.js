import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  useWindowDimensions,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import UserAvatar from "../components/UserAvatar";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import client from "../api/client";
import { refreshFriends } from "../lib/friends";
import { RADIUS, SPACING } from "../theme/theme";

function studentMeta(student) {
  const place = [student.school, student.course].filter(Boolean).join(" · ");
  return place || `Level ${student.currentLevel || 1}`;
}

export default function FindFriendsScreen({ navigation }) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const compact = width < 390;
  const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async (search = query, { silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await client.get("/students/discover", {
        params: { q: search, school: user?.school || undefined },
      });
      setStudents(data.students || []);
    } catch {
      setStudents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [query, user?.school]);

  useFocusEffect(useCallback(() => { load(""); }, [load]));

  const toggleFollow = async (student) => {
    setBusyId(student.id);
    try {
      if (student.isFollowing) await client.delete(`/students/${student.id}/follow`);
      else await client.post(`/students/${student.id}/follow`);
      setStudents((current) =>
        current.map((row) => (row.id === student.id ? { ...row, isFollowing: !row.isFollowing } : row))
      );
      if (user?.id) refreshFriends(user.id).catch(() => {});
    } catch {
      // keep current follow state
    } finally {
      setBusyId(null);
    }
  };

  const clearSearch = () => {
    setQuery("");
    load("");
  };

  const renderStudent = ({ item }) => {
    const following = Boolean(item.isFollowing);
    const busy = busyId === item.id;
    return (
      <Pressable
        onPress={() => navigation.navigate("StudentProfile", { userId: item.id, name: item.name })}
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <UserAvatar user={item} size={compact ? 44 : 48} />
        <View style={styles.cardCopy}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.meta} numberOfLines={1}>{studentMeta(item)}</Text>
          <View style={styles.chipRow}>
            <View style={styles.chip}>
              <Ionicons name="flash-outline" size={11} color={colors.amber} />
              <Text style={styles.chipText}>Lv {item.currentLevel || 1}</Text>
            </View>
            {item.school ? (
              <View style={styles.chip}>
                <Ionicons name="school-outline" size={11} color={colors.violet} />
                <Text style={styles.chipText} numberOfLines={1}>{item.school}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Pressable
          onPress={() => toggleFollow(item)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={following ? `Unfollow ${item.name}` : `Follow ${item.name}`}
          style={({ pressed }) => [
            styles.followBtn,
            following ? styles.followBtnOn : styles.followBtnOff,
            (pressed || busy) && styles.pressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator size="small" color={following ? colors.text : "#fff"} />
          ) : (
            <>
              <Ionicons
                name={following ? "checkmark" : "person-add-outline"}
                size={14}
                color={following ? colors.text : "#fff"}
              />
              <Text style={[styles.followText, following && styles.followTextOn]}>
                {following ? "Following" : "Follow"}
              </Text>
            </>
          )}
        </Pressable>
      </Pressable>
    );
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Find friends</Text>
          <Text style={styles.subtitle}>Meet classmates and grow your study circle.</Text>
        </View>
        <View style={styles.headerIcon}>
          <Ionicons name="people" size={18} color={colors.violet} />
        </View>
      </View>

      <View style={styles.search}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => load(query)}
          placeholder="Search name, school, or course"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          returnKeyType="search"
        />
        {query ? (
          <Pressable onPress={clearSearch} hitSlop={8} accessibilityLabel="Clear search">
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
        <Pressable onPress={() => load(query)} style={styles.searchBtn} accessibilityLabel="Search students">
          <Text style={styles.searchBtnText}>Search</Text>
        </Pressable>
      </View>

      <View style={styles.listHead}>
        <Text style={styles.listTitle}>{user?.school ? `People at ${user.school}` : "People you may know"}</Text>
        <Text style={styles.listCount}>
          {loading ? "…" : `${students.length} ${students.length === 1 ? "student" : "students"}`}
        </Text>
      </View>

      {loading && !refreshing ? (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.violet} />
          <Text style={styles.loadingText}>Finding students…</Text>
        </View>
      ) : (
        <FlatList
          data={students}
          keyExtractor={(item) => item.id}
          renderItem={renderStudent}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load(query, { silent: true });
              }}
              tintColor={colors.violet}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="search-outline" size={22} color={colors.violet} />
              </View>
              <Text style={styles.emptyTitle}>No students found</Text>
              <Text style={styles.emptyText}>
                Try another name, school, or course. You can also pull down to refresh.
              </Text>
            </View>
          }
        />
      )}
    </Screen>
  );
}

const createStyles = (colors, compact) =>
  StyleSheet.create({
    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingTop: SPACING.sm,
      marginBottom: 12,
    },
    backBtn: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    headerCopy: { flex: 1, minWidth: 0 },
    title: { color: colors.text, fontSize: compact ? 20 : 22, fontWeight: "800" },
    subtitle: { color: colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 2 },
    headerIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      backgroundColor: colors.violetSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    search: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      minHeight: 44,
      paddingLeft: 12,
      paddingRight: 6,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      backgroundColor: colors.surface,
      marginBottom: 12,
    },
    input: {
      flex: 1,
      minWidth: 0,
      color: colors.text,
      fontSize: 14,
      fontWeight: "600",
      paddingVertical: 10,
    },
    searchBtn: {
      minHeight: 32,
      paddingHorizontal: 12,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.violetSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    searchBtnText: { color: colors.violet, fontSize: 12, fontWeight: "800" },
    listHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      marginBottom: 8,
    },
    listTitle: { flex: 1, minWidth: 0, color: colors.text, fontSize: 14, fontWeight: "800" },
    listCount: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
    list: { paddingBottom: 28, gap: 8 },
    card: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingVertical: 10,
      paddingHorizontal: 10,
    },
    cardCopy: { flex: 1, minWidth: 0 },
    name: { color: colors.text, fontSize: 14.5, fontWeight: "800" },
    meta: { color: colors.textMuted, fontSize: 12, fontWeight: "600", marginTop: 2 },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      maxWidth: "78%",
      paddingHorizontal: 7,
      paddingVertical: 3,
      borderRadius: RADIUS.pill,
      backgroundColor: colors.bg,
    },
    chipText: { color: colors.textMuted, fontSize: 10.5, fontWeight: "700" },
    followBtn: {
      minWidth: compact ? 86 : 96,
      minHeight: 34,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      paddingHorizontal: 10,
      borderRadius: RADIUS.pill,
      borderWidth: 1,
    },
    followBtnOff: { backgroundColor: colors.tomato, borderColor: colors.tomato },
    followBtnOn: { backgroundColor: colors.bg, borderColor: colors.border },
    followText: { color: "#fff", fontSize: 12, fontWeight: "800" },
    followTextOn: { color: colors.text },
    loading: { alignItems: "center", paddingTop: 36, gap: 10 },
    loadingText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
    empty: { alignItems: "center", paddingTop: 28, paddingHorizontal: 20 },
    emptyIcon: {
      width: 46,
      height: 46,
      borderRadius: 16,
      backgroundColor: colors.violetSoft,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    emptyTitle: { color: colors.text, fontSize: 15, fontWeight: "800" },
    emptyText: { color: colors.textMuted, fontSize: 13, lineHeight: 18, textAlign: "center", marginTop: 4, maxWidth: 280 },
    pressed: { opacity: 0.82 },
  });
