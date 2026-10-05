import React from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import UserAvatar from "./UserAvatar";

export default function StudentCard({
  student,
  colors,
  onPress,
  onFollow,
  following,
  followBusy,
  meta,
  rank,
  nested,
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        nested ? styles.nested : null,
        { backgroundColor: nested ? colors.bg : colors.surface, borderColor: colors.border, opacity: pressed ? 0.86 : 1 },
      ]}
    >
      {rank ? (
        <Text style={[styles.rank, { color: colors.textMuted }]}>{rank}</Text>
      ) : null}
      <UserAvatar user={student} size={40} />
      <View style={styles.copy}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{student.name}</Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {meta || [student.school, student.course].filter(Boolean).join(" · ") || `Lv ${student.currentLevel || 1} · ${student.xp || 0} XP`}
        </Text>
      </View>
      {onFollow ? (
        <Pressable
          onPress={onFollow}
          disabled={followBusy}
          style={[
            styles.followBtn,
            {
              backgroundColor: following ? colors.bg : colors.tomato,
              borderColor: following ? colors.border : colors.tomato,
            },
          ]}
        >
          <Text style={[styles.followText, { color: following ? colors.text : "#fff" }]}>
            {following ? "Following" : "Follow"}
          </Text>
        </Pressable>
      ) : (
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  nested: {
    borderWidth: 0,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  rank: { width: 20, fontSize: 12, fontWeight: "800", textAlign: "center" },
  copy: { flex: 1, minWidth: 0 },
  name: { fontSize: 13.5, fontWeight: "800" },
  meta: { fontSize: 11, marginTop: 1 },
  followBtn: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  followText: { fontSize: 11.5, fontWeight: "800" },
});
