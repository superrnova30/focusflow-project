import React from "react";
import { Pressable, Text, View, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import UserAvatar from "./UserAvatar";

const MEDALS = {
  1: { icon: "trophy", color: "#FFC15E" },
  2: { icon: "medal", color: "#C0C7D4" },
  3: { icon: "medal", color: "#D9935A" },
};

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
  const medal = MEDALS[rank];
  const schoolName = student?.schoolRecord?.name || student?.school;
  const subtitle =
    meta ||
    [schoolName, student?.course].filter(Boolean).join(" · ") ||
    `Lv ${student?.currentLevel || 1} · ${student?.xp || 0} XP`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={student?.name}
      style={({ pressed }) => [
        styles.row,
        nested ? styles.nested : null,
        {
          backgroundColor: nested ? "transparent" : colors.surface,
          borderColor: nested ? "transparent" : colors.border,
          opacity: pressed ? 0.88 : 1,
        },
      ]}
    >
      {rank ? (
        <View
          style={[
            styles.rankBadge,
            { backgroundColor: medal ? `${medal.color}22` : colors.violetSoft },
          ]}
        >
          {medal ? (
            <Ionicons name={medal.icon} size={14} color={medal.color} />
          ) : (
            <Text style={[styles.rank, { color: colors.violet }]}>{rank}</Text>
          )}
        </View>
      ) : null}
      <UserAvatar user={student} size={nested ? 36 : 42} />
      <View style={styles.copy}>
        <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
          {student?.name}
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {onFollow ? (
        <Pressable
          onPress={onFollow}
          disabled={followBusy}
          accessibilityRole="button"
          accessibilityLabel={following ? `Unfollow ${student?.name}` : `Follow ${student?.name}`}
          style={({ pressed }) => [
            styles.followBtn,
            {
              backgroundColor: following ? colors.bg : colors.tomato,
              borderColor: following ? colors.border : colors.tomato,
              opacity: pressed || followBusy ? 0.82 : 1,
            },
          ]}
        >
          {followBusy ? (
            <ActivityIndicator size="small" color={following ? colors.text : "#fff"} />
          ) : (
            <>
              <Ionicons
                name={following ? "checkmark" : "person-add-outline"}
                size={13}
                color={following ? colors.text : "#fff"}
              />
              <Text style={[styles.followText, { color: following ? colors.text : "#fff" }]}>
                {following ? "Following" : "Follow"}
              </Text>
            </>
          )}
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
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 12,
    minHeight: 64,
  },
  nested: {
    borderWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 8,
    minHeight: 52,
    backgroundColor: "transparent",
  },
  rankBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
    flexShrink: 0,
  },
  rank: { fontSize: 11, fontWeight: "800", textAlign: "center" },
  copy: { flex: 1, minWidth: 0 },
  name: { fontSize: 14, fontWeight: "800" },
  meta: { fontSize: 12, marginTop: 2, fontWeight: "600" },
  followBtn: {
    minWidth: 92,
    minHeight: 34,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    flexShrink: 0,
  },
  followText: { fontSize: 12, fontWeight: "800" },
});
