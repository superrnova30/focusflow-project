import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { RADIUS, SPACING } from "../theme/theme";

export default function VerifyEmailScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { verifyEmail, sendVerificationCode } = useAuth();

  const email = route?.params?.email || "";
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState(route?.params?.initialMessage || "");
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;
    async function autoSendIfRequested() {
      if (!route?.params?.autoSend || !email) return;
      try {
        setResending(true);
        setError("");
        const result = await sendVerificationCode(email.trim().toLowerCase());
        if (!mounted) return;
        setMessage(result?.message || "A verification code has been sent to your email.");
      } catch (e) {
        if (!mounted) return;
        setError(e?.response?.data?.error || e.message || "Could not send verification code.");
      } finally {
        if (mounted) setResending(false);
      }
    }
    autoSendIfRequested();
    return () => {
      mounted = false;
    };
  }, [route?.params?.autoSend, email, sendVerificationCode]);

  useEffect(() => {
    if (route?.params?.initialMessage) {
      setMessage(route.params.initialMessage);
    }
  }, [route?.params?.initialMessage]);

  const submit = async () => {
    setMessage("");
    setError("");
    const trimmed = code.trim();
    if (!trimmed) {
      Alert.alert("Code required", "Enter the verification code from your email.");
      return;
    }

    setLoading(true);
    try {
      const result = await verifyEmail(email.trim().toLowerCase(), trimmed);
      Alert.alert("Success", "Your email has been verified.");
      if (result?.token) {
        navigation.reset({ index: 0, routes: [{ name: "Home" }] });
      } else {
        navigation.navigate("Login");
      }
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "The code is invalid or expired.");
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    setMessage("");
    setError("");
    setResending(true);
    try {
      const result = await sendVerificationCode(email.trim().toLowerCase());
      setMessage(result?.message || "A new verification code has been sent to your email.");
      setCode("");
    } catch (e) {
      setError(e?.response?.data?.error || e.message || "Unable to resend verification code.");
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
        >
          <View style={styles.card}>
            <View style={styles.iconWrap}>
              <Ionicons name="mail-outline" size={28} color={colors.violet} />
            </View>
            <Text style={styles.title}>Verify your email</Text>
            <Text style={styles.subtitle}>We sent a 5-digit code to</Text>
            <Text style={styles.emailText}>{email}</Text>
            <Text style={styles.hint}>
              Open your email inbox and enter the code below. Check your spam or junk folder if you do not see it within a few minutes.
            </Text>

            <Text style={styles.fieldLabel}>Verification code</Text>
            <TextInput
              value={code}
              onChangeText={(value) => setCode(value.replace(/\s/g, ""))}
              placeholder="12345"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={5}
              autoComplete="off"
              textContentType="oneTimeCode"
              style={[styles.codeInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
            />

            {!!message && <Text style={[styles.message, { color: colors.mint }]}>{message}</Text>}
            {!!error && <Text style={[styles.message, { color: colors.tomato }]}>{error}</Text>}

            <Pressable
              onPress={submit}
              disabled={loading}
              style={({ pressed }) => [styles.primaryBtn, (pressed || loading) && styles.pressed]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>Verify email</Text>
              )}
            </Pressable>

            <Pressable
              onPress={resendCode}
              disabled={resending}
              style={({ pressed }) => [styles.secondaryBtn, (pressed || resending) && styles.pressed]}
            >
              {resending ? (
                <ActivityIndicator color={colors.violet} />
              ) : (
                <Text style={[styles.secondaryBtnText, { color: colors.violet }]}>Resend code</Text>
              )}
            </Pressable>

            <Pressable onPress={() => navigation.navigate("Login")} style={styles.backLink}>
              <Text style={[styles.backLinkText, { color: colors.textMuted }]}>Back to sign in</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    flex: { flex: 1 },
    scroll: {
      flexGrow: 1,
      justifyContent: "center",
      paddingVertical: SPACING.xl,
      paddingBottom: 48,
    },
    card: {
      width: "100%",
      maxWidth: 480,
      alignSelf: "center",
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: RADIUS.lg,
      padding: 22,
    },
    iconWrap: {
      width: 56,
      height: 56,
      borderRadius: 18,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.violetSoft,
      marginBottom: 14,
    },
    title: { color: colors.text, fontSize: 24, fontWeight: "900", marginBottom: 6 },
    subtitle: { color: colors.textMuted, fontSize: 13 },
    emailText: { color: colors.violet, fontSize: 14, fontWeight: "800", marginTop: 4, marginBottom: 12 },
    hint: { color: colors.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: 18 },
    fieldLabel: { color: colors.text, fontSize: 13, fontWeight: "700", marginBottom: 8 },
    codeInput: {
      height: 52,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      paddingHorizontal: 14,
      fontSize: 22,
      fontWeight: "800",
      letterSpacing: 6,
      textAlign: "center",
      marginBottom: 12,
    },
    message: { fontSize: 12.5, lineHeight: 18, marginBottom: 10 },
    primaryBtn: {
      height: 50,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.tomato,
      borderRadius: RADIUS.md,
      marginTop: 4,
    },
    primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "800" },
    secondaryBtn: {
      height: 46,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 10,
    },
    secondaryBtnText: { fontSize: 14, fontWeight: "800" },
    backLink: { alignItems: "center", paddingVertical: 12, marginTop: 4 },
    backLinkText: { fontSize: 13, fontWeight: "600" },
    pressed: { opacity: 0.75 },
  });
