import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View, StyleSheet, useWindowDimensions } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { getCachedFriends, refreshFriends, subscribeFriends } from "../lib/friends";

export default function FriendsBalance({ compact: compactProp }) {
  const { width } = useWindowDimensions();
  const compact = compactProp ?? width < 380;
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { user } = useAuth();
  const [count, setCount] = useState(() => getCachedFriends(0));
  const label = count === 1 ? "Friend" : "Friends";

  useEffect(() => subscribeFriends(setCount), []);

  useFocusEffect(
    useCallback(() => {
      if (user?.id) refreshFriends(user.id).catch(() => {});
    }, [user?.id])
  );

  const openFriends = () => {
    if (!user?.id) return;
    const params = { userId: user.id, mode: "friends", name: user.name };
    const names = navigation.getState?.()?.routeNames || [];
    if (names.includes("FollowList")) {
      navigation.navigate("FollowList", params);
      return;
    }
    navigation.navigate("Profile", { screen: "FollowList", params });
  };

  return (
    <Pressable
      onPress={openFriends}
      accessibilityRole="button"
      accessibilityLabel={`${count} ${label}. Open friends`}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: colors.violetSoft, borderColor: colors.violet },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.surface }]}>
        <Ionicons name="people" size={compact ? 13 : 14} color={colors.violet} />
      </View>
      <Text style={[styles.text, { color: colors.violet }]} numberOfLines={1}>
        {count} {label}
      </Text>
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
    paddingVertical: 4,
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
  text: {
    fontSize: 12.5,
    lineHeight: 16,
    fontWeight: "800",
  },
});
