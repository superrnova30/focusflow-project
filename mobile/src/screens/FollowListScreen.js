import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator } from "react-native";
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

export default function FollowListScreen({ route, navigation }) {
  const { userId, mode = "followers", name } = route.params || {};
  const { colors } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const title = TITLES[mode] || "Followers";

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data } = await client.get(`/students/${userId}/${mode}`);
      setStudents(data.students || []);
    } catch {
      setStudents([]);
    } finally {
      setLoading(false);
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

  return (
    <Screen>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{name ? `${name}'s ${title.toLowerCase()}` : title}</Text>
        </View>
      </View>
      {loading ? (
        <ActivityIndicator color={colors.violet} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={students}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24, gap: 8 }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.empty}>
                {mode === "friends" ? "No friends yet. Follow someone who follows you back." : "No students here yet."}
              </Text>
              {mode === "friends" ? (
                <Pressable
                  onPress={() => {
                    const names = navigation.getState?.()?.routeNames || [];
                    if (names.includes("FindFriends")) navigation.navigate("FindFriends");
                    else navigation.navigate("Profile", { screen: "FindFriends" });
                  }}
                  style={styles.findBtn}
                >
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
    </Screen>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    header: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
    backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    title: { color: colors.text, fontSize: 22, fontWeight: "800" },
    subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    emptyWrap: { alignItems: "center", marginTop: 28, paddingHorizontal: 20, gap: 12 },
    empty: { color: colors.textMuted, textAlign: "center" },
    findBtn: {
      backgroundColor: colors.tomato,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 9,
    },
    findBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
  });
