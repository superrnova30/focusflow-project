import React from "react";
import { View, Text, Modal, ActivityIndicator, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../context/ThemeContext";
import { RADIUS } from "../theme/theme";

export default function PaymentConfirmingModal({
  visible,
  phase = "confirming",
  onDismiss,
  onRetryCheck,
}) {
  const { colors } = useTheme();

  const isConfirming = phase === "confirming";
  const isSuccess = phase === "success";
  const isFailed = phase === "failed";
  const isPending = phase === "pending";

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          {isConfirming && (
            <>
              <ActivityIndicator size="large" color={colors.violet} />
              <Text style={[styles.title, { color: colors.text }]}>Payment is being confirmed…</Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                We are checking with Xendit on our server. This usually takes a few seconds after you finish checkout.
              </Text>
            </>
          )}
          {isSuccess && (
            <>
              <View style={[styles.iconOk, { backgroundColor: colors.mintSoft }]}>
                <Ionicons name="checkmark-circle" size={48} color={colors.mint} />
              </View>
              <Text style={[styles.title, { color: colors.text }]}>🎉 Payment Successful!</Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>Welcome to Go Unlimited! Your Unlimited features are now unlocked.</Text>
            </>
          )}
          {isPending && (
            <>
              <Ionicons name="time-outline" size={40} color={colors.amber} style={{ alignSelf: "center" }} />
              <Text style={[styles.title, { color: colors.text }]}>Still confirming</Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                Xendit has not marked this invoice paid yet. If you completed payment, wait a moment and tap Check again.
              </Text>
              {onRetryCheck && (
                <Pressable onPress={onRetryCheck} style={[styles.btn, { backgroundColor: colors.violet }]}>
                  <Text style={styles.btnText}>Check again</Text>
                </Pressable>
              )}
            </>
          )}
          {isFailed && (
            <>
              <Ionicons name="close-circle-outline" size={40} color={colors.amber} style={{ alignSelf: "center" }} />
              <Text style={[styles.title, { color: colors.text }]}>Payment not completed</Text>
              <Text style={[styles.body, { color: colors.textMuted }]}>
                Your account is still on the Basic plan. You can try Go Unlimited again when ready.
              </Text>
            </>
          )}
          {!isConfirming && (
            <Pressable onPress={onDismiss} style={[styles.linkBtn, { marginTop: 16 }]}>
              <Text style={[styles.linkText, { color: colors.violet }]}>Continue</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(14, 18, 32, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    padding: 22,
    alignItems: "stretch",
    gap: 10,
  },
  iconOk: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: { fontSize: 18, fontWeight: "900", textAlign: "center" },
  body: { fontSize: 14, lineHeight: 21, textAlign: "center" },
  btn: {
    marginTop: 8,
    minHeight: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { color: "#fff", fontWeight: "800", fontSize: 15 },
  linkBtn: { alignItems: "center", paddingVertical: 8 },
  linkText: { fontSize: 15, fontWeight: "700" },
});
