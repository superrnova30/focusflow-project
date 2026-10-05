import React from "react";
import { View, StyleSheet } from "react-native";
import CoinBalance from "./CoinBalance";
import StreakBalance from "./StreakBalance";
import FriendsBalance from "./FriendsBalance";

export default function HeaderWallet({ compact, showFriends = true }) {
  return (
    <View style={styles.row}>
      <StreakBalance compact={compact} />
      <CoinBalance compact={compact} />
      {showFriends ? <FriendsBalance compact={compact} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
  },
});
