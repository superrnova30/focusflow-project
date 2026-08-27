import React, { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert } from "react-native";
import { Screen, Card } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

export default function VerifyEmailScreen({ navigation, route }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const { verifyEmail, sendVerificationCode } = useAuth();

  const email = route?.params?.email || "";
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState("");

  // If the screen was opened with `autoSend`, immediately request a
  // verification code so users arriving from the login flow don't have
  // to press "Resend" first.
  React.useEffect(() => {
    let mounted = true;
    async function autoSendIfRequested() {
      if (route?.params?.autoSend && email) {
        try {
          setResending(true);
          await sendVerificationCode(email.trim().toLowerCase());
          if (!mounted) return;
          setMessage("A verification code has been sent to your email.");
        } catch (e) {
          // Non-fatal — user can tap Resend manually.
        } finally {
          if (mounted) setResending(false);
        }
      }
    }
    autoSendIfRequested();
    return () => {
      mounted = false;
    };
  }, [route, email, sendVerificationCode]);

  const submit = async () => {
    setMessage("");
    if (!code.trim()) {
      Alert.alert("Code required", "Please enter the verification code from your email.");
      return;
    }

    setLoading(true);
    try {
      const result = await verifyEmail(email.trim().toLowerCase(), code.trim().toUpperCase());
      Alert.alert("Success", "Your email has been verified.");
      // If the verification returned a token the user is now authenticated
      // — reset navigation so the authenticated navigator becomes active.
      if (result?.token) {
        navigation.reset({ index: 0, routes: [{ name: "Home" }] });
      } else {
        // Fallback: go back to Login so user can sign in.
        navigation.navigate("Login");
      }
    } catch (e) {
      Alert.alert("Verification failed", e.message || "The code is invalid or expired.");
    } finally {
      setLoading(false);
    }
  };

  const resendCode = async () => {
    setMessage("");
    setResending(true);
    try {
      await sendVerificationCode(email.trim().toLowerCase());
      setMessage("A new verification code has been sent to your email.");
      setCode("");
    } catch (e) {
      Alert.alert("Resend failed", e.message || "Unable to resend verification code.");
    } finally {
      setResending(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.center}>
            <View style={styles.form}>
              <Card style={styles.card}>
                <Text style={styles.title}>Verify Your Email</Text>
                <Text style={styles.subtitle}>We sent a verification code to:</Text>
                <Text style={styles.emailText}>{email}</Text>

                <Input
                  style={styles.fullWidth}
                  value={code}
                  onChangeText={setCode}
                  placeholder="Enter verification code"
                  autoCapitalize="characters"
                  editable={!loading}
                />

                {message ? <Text style={styles.message}>{message}</Text> : null}

                <Button style={styles.fullWidth} title="Verify Email" onPress={submit} loading={loading} />

                <Button
                  style={[styles.fullWidth, styles.ghost]}
                  title="Didn't receive code? Resend"
                  onPress={resendCode}
                  loading={resending}
                  variant="ghost"
                />

                <Button
                  style={[styles.fullWidth, styles.ghost]}
                  title="Back to Login"
                  onPress={() => navigation.navigate("Login")}
                  variant="ghost"
                />
              </Card>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    scroll: { flexGrow: 1 },
    center: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 28 },
    form: { width: "100%", maxWidth: 520 },
    card: { padding: 24 },
    title: { fontSize: 24, fontWeight: "700", marginBottom: 8, color: colors.text },
    subtitle: { fontSize: 14, color: colors.textSecondary, marginBottom: 8 },
    emailText: { fontSize: 14, fontWeight: "600", color: colors.primary, marginBottom: 20 },
    fullWidth: { width: "100%", marginVertical: 8 },
    ghost: { marginTop: 12 },
    message: { fontSize: 14, color: colors.success, marginVertical: 12, textAlign: "center" },
  });
