import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { RADIUS } from "../theme/theme";

const GOLD = "#D4A017";
const GOLD_DEEP = "#B8860B";

export default function GoUnlimitedModal({ visible, message, onClose, onUpgrade, loading = false }) {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(400, width - 32);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (visible) {
      opacity.setValue(0);
      scale.setValue(0.96);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(scale, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, opacity, scale]);

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View
          style={[
            styles.card,
            {
              width: cardWidth,
              backgroundColor: colors.surface,
              borderColor: colors.border,
              opacity,
              transform: [{ scale }],
            },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: isDark ? `${GOLD}22` : `${GOLD}18` }]}>
            <Text style={styles.rocket}>🚀</Text>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Go Unlimited 🚀</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>{message}</Text>
          <Pressable
            onPress={onUpgrade}
            disabled={loading}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: GOLD, opacity: loading ? 0.75 : pressed ? 0.9 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Go Unlimited upgrade"
          >
            {loading ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.primaryText}>Preparing secure checkout…</Text>
              </>
            ) : (
              <>
                <Ionicons name="diamond-outline" size={18} color="#fff" />
                <Text style={styles.primaryText}>Go Unlimited</Text>
              </>
            )}
          </Pressable>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: colors.border, backgroundColor: colors.bg, opacity: pressed ? 0.85 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={[styles.secondaryText, { color: colors.text }]}>Not now</Text>
          </Pressable>
          <Text style={[styles.footnote, { color: colors.textMuted }]}>
            Basic stays free — upgrade only when you want every limit removed.
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(14, 18, 32, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 18,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 10,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  rocket: { fontSize: 28 },
  title: { fontSize: 20, fontWeight: "900", marginBottom: 8, textAlign: "center" },
  body: { fontSize: 14, lineHeight: 21, textAlign: "center", marginBottom: 18, maxWidth: 340 },
  primaryBtn: {
    width: "100%",
    minHeight: 48,
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
  },
  primaryText: { color: "#fff", fontSize: 15, fontWeight: "800" },
  secondaryBtn: {
    width: "100%",
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { fontSize: 14, fontWeight: "700" },
  footnote: { fontSize: 11, lineHeight: 16, textAlign: "center", marginTop: 12, maxWidth: 300 },
});
