import React, { useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { Screen } from "../components/Screen";
import { Input, Button } from "../components/Inputs";
import { useTheme } from "../context/ThemeContext";
import { useAuth } from "../context/AuthContext";

export default function SignupScreen({ navigation }) {
  const { colors } = useTheme();
  const styles = useStyles(colors);
  const { signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError(null);
    if (!name.trim() || !email || !password) return setError("All fields are required.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    setLoading(true);
    try {
      await signup(name.trim(), email.trim().toLowerCase(), password);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={styles.center}>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Set up FocusFlow to start tracking your study sessions.</Text>

        <Input value={name} onChangeText={setName} placeholder="Full name" />
        <Input value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" keyboardType="email-address" />
        <Input value={password} onChangeText={setPassword} placeholder="Password (min. 8 characters)" secureTextEntry />

        {error && <Text style={styles.error}>{error}</Text>}

        <Button title="Sign up" onPress={submit} loading={loading} />

        <Button title="Already have an account? Log in" onPress={() => navigation.navigate("Login")} variant="ghost" />
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
