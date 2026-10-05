import React from "react";
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { RADIUS } from "../theme/theme";

const GOLD = "#D4A017";
const GOLD_DEEP = "#B8860B";

export default function GoUnlimitedCheckoutModal({
  visible,
  onOpenCheckout,
  onCancel,
  onGoBack,
  opening = false,
  error = null,
  testMode = false,
  testInstructions = null,
}) {
  const { colors, isDark } = useTheme();
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(400, width - 32);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Close overlay" />
        <View
          style={[
            styles.card,
            {
              width: cardWidth,
              backgroundColor: colors.surface,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={[styles.iconWrap, { backgroundColor: isDark ? `${GOLD}22` : `${GOLD}18` }]}>
            <Ionicons name="card-outline" size={28} color={GOLD_DEEP} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Go Unlimited checkout</Text>
          <Text style={[styles.body, { color: colors.textMuted }]}>
            Pay securely on Xendit's page (GCash, Maya, cards, and other methods in Test Mode). FocusFlow
            upgrades your account only after payment is verified on our server.
          </Text>
          {testMode && (
            <>
              <Text style={[styles.hint, { color: colors.mint }]}>Xendit Test Mode — no real charges.</Text>
              {!!testInstructions && (
                <Text style={[styles.testSteps, { color: colors.textMuted }]}>{testInstructions}</Text>
              )}
            </>
          )}
          {!!error && (
            <View style={[styles.errorBox, { backgroundColor: colors.amberSoft, borderColor: colors.amber + "66" }]}>
              <Text style={[styles.errorText, { color: colors.text }]}>{error}</Text>
            </View>
          )}

          <Pressable
            onPress={onOpenCheckout}
            disabled={opening}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: GOLD, opacity: opening ? 0.8 : pressed ? 0.92 : 1 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Open Checkout"
          >
            {opening ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.primaryText}>Preparing checkout…</Text>
              </>
            ) : (
              <>
                <Ionicons name="open-outline" size={18} color="#fff" />
                <Text style={styles.primaryText}>Open Checkout</Text>
              </>
            )}
          </Pressable>

          <Pressable
            onPress={onCancel}
            disabled={opening}
            style={({ pressed }) => [
              styles.secondaryBtn,
              { borderColor: colors.border, backgroundColor: colors.bg, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            <Text style={[styles.secondaryText, { color: colors.text }]}>Cancel</Text>
          </Pressable>

          <Pressable onPress={onGoBack} disabled={opening} style={styles.linkBtn}>
            <Text style={[styles.linkText, { color: colors.violet }]}>Go Back</Text>
          </Pressable>
        </View>
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
    alignItems: "stretch",
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "center",
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: "900", textAlign: "center", marginBottom: 8 },
  body: { fontSize: 14, lineHeight: 21, textAlign: "center", marginBottom: 14 },
  hint: { fontSize: 12, fontWeight: "700", textAlign: "center", marginBottom: 6 },
  testSteps: { fontSize: 12, lineHeight: 18, textAlign: "center", marginBottom: 12 },
  errorBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { fontSize: 13, lineHeight: 19, textAlign: "center" },
  primaryBtn: {
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
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  secondaryText: { fontSize: 14, fontWeight: "700" },
  linkBtn: { alignItems: "center", paddingVertical: 8 },
  linkText: { fontSize: 14, fontWeight: "700" },
});
