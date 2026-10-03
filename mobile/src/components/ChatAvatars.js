import React from "react";
import { View, Image, StyleSheet } from "react-native";
import { useTheme } from "../context/ThemeContext";
import UserAvatar from "./UserAvatar";

const LOGO = require("../theme/logo.png");

export function AiAssistantAvatar({ size = 28, style }) {
  const { colors } = useTheme();
  const box = {
    width: size,
    height: size,
    borderRadius: size / 2.2,
  };

  return (
    <View
      style={[
        styles.aiAvatar,
        box,
        { backgroundColor: colors.tomatoSoft, borderColor: colors.border },
        style,
      ]}
      accessibilityLabel="FocusFlow AI assistant"
    >
      <Image source={LOGO} style={{ width: size * 0.68, height: size * 0.68 }} resizeMode="contain" />
    </View>
  );
}

export function ChatParticipantAvatar({ role, user, size = 28, style }) {
  if (role === "user") {
    return <UserAvatar user={user} size={size} style={style} />;
  }
  return <AiAssistantAvatar size={size} style={style} />;
}

const styles = StyleSheet.create({
  aiAvatar: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
  },
});
