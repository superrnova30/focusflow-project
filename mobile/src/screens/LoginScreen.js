import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Screen } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

export default function LoginScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!email || !password) return setError("Email and password are required.");
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      // Navigation happens automatically — RootNavigator re-renders once
      // `user` is set and routes by role.
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.center}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Log in to pick up right where you left off.</Text>

        <Input value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" keyboardType="email-address" />
        <Input value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry />

        {error && <Text style={styles.error}>{error}</Text>}

        <Button title="Log in" onPress={submit} loading={loading} />

        <Button title="New here? Sign up" onPress={() => navigation.navigate("Signup")} variant="ghost" />
      </View>
    </Screen>
  );
}

const useStyles = (colors) =>
  StyleSheet.create({
    center: { flex: 1, justifyContent: "center" },
    title: { color: colors.text, fontSize: 26, fontWeight: "700", marginBottom: 6 },
    subtitle: { color: colors.textMuted, fontSize: 14, marginBottom: 24, lineHeight: 20 },
    error: { color: colors.tomato, fontSize: 13, marginBottom: 12 },
  });
