import React, { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert } from "react-native";
import { Screen, Card } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

export default function ForgotPasswordScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const { requestPasswordReset, resetPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState("request");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const requestReset = async () => {
    setMessage("");
    if (!email.trim()) {
      Alert.alert("Email required", "Enter the email address linked to your account.");
      return;
    }

    setLoading(true);
    try {
      const data = await requestPasswordReset(email.trim().toLowerCase());
      setMessage(data.message || "A reset link or code has been sent to your email.");
      setStep("reset");
    } catch (e) {
      Alert.alert("Reset request failed", e.message || "Unable to request a password reset.");
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async () => {
    setMessage("");
    if (!email.trim() || !code.trim() || !newPassword.trim()) {
      Alert.alert("Missing information", "Enter your email, the code from the email, and a new password.");
      return;
    }
    if (newPassword.length < 8) {
      Alert.alert("Password too short", "Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email.trim().toLowerCase(), code.trim().toUpperCase(), newPassword);
      Alert.alert("Password reset", "Your password has been updated. You can sign in now.");
      navigation.navigate("Login");
    } catch (e) {
      Alert.alert("Unable to reset password", e.message || "The reset code is invalid or expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.center}>
            <View style={styles.form}>
              <Card style={styles.card}>
                <Text style={styles.title}>Forgot Password</Text>
                <Text style={styles.subtitle}>We’ll email you a reset code or link.</Text>

                <Input style={styles.fullWidth} value={email} onChangeText={setEmail} placeholder="Registered email" autoCapitalize="none" keyboardType="email-address" />

                {step === "request" ? (
                  <Button style={styles.fullWidth} title="Send reset code" onPress={requestReset} loading={loading} />
                ) : (
                  <>
                    <Input style={styles.fullWidth} value={code} onChangeText={setCode} placeholder="Reset code" autoCapitalize="characters" />
                    <Input style={styles.fullWidth} value={newPassword} onChangeText={setNewPassword} placeholder="New password" secureTextEntry />

                    <Button style={styles.fullWidth} title="Reset password" onPress={submitReset} loading={loading} />
                  </>
                )}

                {message ? <Text style={styles.message}>{message}</Text> : null}

                <Button style={[styles.fullWidth, styles.ghost]} title="Back to login" onPress={() => navigation.navigate("Login")} variant="ghost" />
              </Card>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const useStyles = (colors) => StyleSheet.create({
  scroll: { flexGrow: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 28 },
  form: { width: "100%", maxWidth: 520 },
  card: { padding: 18 },
  fullWidth: { width: "100%" },
  title: { color: colors.text, fontSize: 26, fontWeight: "700", marginBottom: 8 },
  subtitle: { color: colors.textMuted, fontSize: 14, marginBottom: 24, lineHeight: 20 },
  message: { color: colors.tomato, fontSize: 13, marginVertical: 12 },
  ghost: { marginTop: 8 },
});
