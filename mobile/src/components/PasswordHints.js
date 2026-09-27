import React, { memo } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";

const ERROR_COLOR = "#EF4444";

function getPasswordStrength(password) {
  if (!password) return { score: 0, label: "", color: "#94A3B8" };
  let score = 0;
  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) || /[^A-Za-z0-9]/.test(password)) score += 1;

  if (score <= 1) return { score: 1, label: "Weak", color: ERROR_COLOR };
  if (score === 2) return { score: 2, label: "Fair", color: "#F59E0B" };
  if (score === 3) return { score: 3, label: "Good", color: "#22C55E" };
  return { score: 4, label: "Strong", color: "#16A34A" };
}

function PasswordHintsInner({ password, confirmPassword, colors }) {
  const strength = getPasswordStrength(password);
  const passwordsMatch = Boolean(confirmPassword) && password === confirmPassword;

  return (
    <>
      <View style={styles.strengthWrap}>
        {password ? (
          <>
            <View style={styles.strengthBars}>
              {[1, 2, 3, 4].map((level) => (
                <View
                  key={level}
                  style={[
                    styles.strengthBar,
                    {
                      backgroundColor:
                        strength.score >= level ? strength.color : colors.border,
                    },
                  ]}
                />
              ))}
            </View>
            <Text style={[styles.strengthText, { color: strength.color }]}>
              {strength.label}
            </Text>
            <Text style={[styles.strengthHint, { color: colors.textMuted }]}>
              8+ characters
            </Text>
          </>
        ) : null}
      </View>
      <View style={styles.matchRow}>
        {confirmPassword ? (
          <>
            <Ionicons
              name={passwordsMatch ? "checkmark-circle" : "alert-circle"}
              size={14}
              color={passwordsMatch ? colors.mint : ERROR_COLOR}
            />
            <Text
              style={[
                styles.matchText,
                { color: passwordsMatch ? colors.mint : ERROR_COLOR },
              ]}
            >
              {passwordsMatch ? "Passwords match" : "Passwords do not match"}
            </Text>
          </>
        ) : null}
      </View>
    </>
  );
}

export const PasswordHints = memo(PasswordHintsInner);

const styles = StyleSheet.create({
  strengthWrap: {
    minHeight: 22,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: -8,
    marginBottom: 10,
  },
  strengthBars: { flex: 1, flexDirection: "row", gap: 4 },
  strengthBar: { flex: 1, height: 3, borderRadius: 2 },
  strengthText: { fontSize: 10.5, fontWeight: "800" },
  strengthHint: { fontSize: 10.5 },
  matchRow: {
    minHeight: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: -8,
    marginBottom: 10,
  },
  matchText: { fontSize: 11, fontWeight: "700" },
});
