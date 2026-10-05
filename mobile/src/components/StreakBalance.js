import React, { useCallback, useState } from "react";
import { Pressable, Text, View, StyleSheet, useWindowDimensions } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import client from "../api/client";
import { getStreakLevel } from "../lib/streakLevels";

export default function StreakBalance({ compact: compactProp }) {
  const { width } = useWindowDimensions();
  const compact = compactProp ?? width < 380;
  const navigation = useNavigation();
  const { user } = useAuth();
  const [streak, setStreak] = useState(user?.streakCount || 0);
  const level = getStreakLevel(streak);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      client
        .get("/game/streak")
        .then(({ data }) => {
          if (active) setStreak(data?.streak?.current ?? user?.streakCount ?? 0);
        })
        .catch(() => {
          if (active && user?.streakCount != null) setStreak(user.streakCount);
        });
      return () => {
        active = false;
      };
    }, [user?.streakCount])
  );

  const openProgress = () => {
    const names = navigation.getState?.()?.routeNames || [];
    if (names.includes("Progress")) navigation.navigate("Progress");
    else navigation.navigate("Study", { screen: "Progress" });
  };

  return (
    <Pressable
      onPress={openProgress}
      accessibilityRole="button"
      accessibilityLabel={`${streak} day streak`}
      style={({ pressed }) => [styles.chip, { backgroundColor: level.softColor, borderColor: `${level.color}55` }, pressed && styles.pressed]}
    >
      <View style={[styles.iconWrap, { backgroundColor: `${level.color}22` }]}>
        <Ionicons name="flame" size={compact ? 13 : 14} color={level.color} />
      </View>
      <Text style={[styles.value, { color: level.color }]}>{streak}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingLeft: 5,
    paddingRight: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    flexShrink: 0,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
});
