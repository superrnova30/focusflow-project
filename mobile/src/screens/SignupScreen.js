import React, { useState } from "react";
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { Screen, Card } from "../components/Screen";
import { Image } from "react-native";
import { Input, Button } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import { useWindowDimensions } from "react-native";
import { useAuth } from "../context/AuthContext";

export default function SignupScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const { width } = useWindowDimensions();
  const isWide = width >= 420;
  const { signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !email || !password || !confirmPassword) return setError("All fields are required.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    setLoading(true);
    try {
      await signup(name.trim(), email.trim().toLowerCase(), password);
      // After successful signup, navigate to email verification and
      // instruct the screen to show the resend message immediately.
      navigation.navigate("VerifyEmail", { email: email.trim().toLowerCase(), autoSend: true });
    } catch (e) {
      setError(e.message);
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
                <View style={[styles.brandRow, isWide && styles.brandRowWide]}>
                  <Image source={require("../theme/logo.png")} style={[styles.logoImg, isWide && styles.logoImgWide]} resizeMode="contain" />
                  <Text style={[styles.brandLong, isWide && styles.brandLongWide]}>AI Pomodoro Study System</Text>
                </View>
                <Text style={styles.title}>Create your account</Text>
                <Text style={styles.subtitle}>Set up AI Pomodoro Study System to start tracking your study sessions.</Text>

                <Input style={styles.fullWidth} value={name} onChangeText={setName} placeholder="Full name" />
                <Input style={styles.fullWidth} value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" keyboardType="email-address" />
                <Input style={styles.fullWidth} value={password} onChangeText={setPassword} placeholder="Password (min. 8 characters)" secureTextEntry />
                <Input style={styles.fullWidth} value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm password" secureTextEntry />

                {error && <Text style={styles.error}>{error}</Text>}

                <Button style={styles.fullWidth} title="Sign up" onPress={submit} loading={loading} />

                <Button style={[styles.fullWidth, styles.ghost]} title="Already have an account? Log in" onPress={() => navigation.navigate("Login")} variant="ghost" />
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
    card: { padding: 18 },
    brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "flex-start", marginBottom: 12 },
    brandRowWide: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
    logoImg: { width: 56, height: 56, marginRight: 12 },
    logoImgWide: { width: 64, height: 64, marginRight: 14 },
    brandLong: { color: colors.text, fontSize: 16, fontWeight: "700", textAlign: "left", marginBottom: 0, lineHeight: 20, flexShrink: 1 },
    brandLongWide: { textAlign: "left", fontSize: 18, flexShrink: 1 },
    fullWidth: { width: "100%" },
    title: { color: colors.text, fontSize: 26, fontWeight: "700", marginBottom: 6 },
    subtitle: { color: colors.textMuted, fontSize: 14, marginBottom: 24, lineHeight: 20 },
    error: { color: colors.tomato, fontSize: 13, marginBottom: 12 },
    ghost: { marginTop: 8 },
  });
