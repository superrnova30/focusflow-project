import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View, StyleSheet, useWindowDimensions } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import CoinIcon from "./CoinIcon";
import {
  getCachedCoins,
  openCoinShop,
  refreshCoins,
  setCachedCoins,
  subscribeCoins,
} from "../lib/coins";

export default function CoinBalance({ compact: compactProp, onPress }) {
  const { width } = useWindowDimensions();
  const compact = compactProp ?? width < 380;
  const navigation = useNavigation();
  const { user, setUser } = useAuth();
  const [coins, setCoins] = useState(() => getCachedCoins(user?.coins || 0));

  useEffect(() => {
    return subscribeCoins((next) => {
      setCoins(next);
      setUser((current) => (current && current.coins !== next ? { ...current, coins: next } : current));
    });
  }, [setUser]);

  useEffect(() => {
    if (user?.coins != null) setCachedCoins(user.coins);
  }, [user?.coins]);

  useFocusEffect(
    useCallback(() => {
      refreshCoins().catch(() => {});
    }, [])
  );

  const handlePress = () => {
    if (onPress) {
      onPress(coins);
      return;
    }
    openCoinShop(navigation);
  };

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${coins} coins. Open Progress to spend or review your balance.`}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
    >
      <View style={styles.iconWrap}>
        <CoinIcon size={compact ? 16 : 18} />
      </View>
      <Text style={styles.value}>{coins}</Text>
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
    backgroundColor: "#FFE8A3",
    borderWidth: 1,
    borderColor: "#F0C96A",
    flexShrink: 0,
  },
  pressed: { opacity: 0.82, transform: [{ scale: 0.98 }] },
  iconWrap: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#FFF6D6",
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
    color: "#3F2A00",
  },
});
