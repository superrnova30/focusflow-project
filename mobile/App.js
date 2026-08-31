import React, { useEffect, useState } from "react";
import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { AppState, View, ActivityIndicator, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";

import { AuthProvider, useAuth } from "./src/context/AuthContext";
import { ThemeProvider, useTheme } from "./src/context/ThemeContext";
import client, { flushQueue } from "./src/api/client";

import HomeScreen from "./src/screens/HomeScreen";
import LoginScreen from "./src/screens/LoginScreen";
import SignupScreen from "./src/screens/SignupScreen";
import ForgotPasswordScreen from "./src/screens/ForgotPasswordScreen";
import VerifyEmailScreen from "./src/screens/VerifyEmailScreen";
import TimerScreen from "./src/screens/TimerScreen";
import TasksScreen from "./src/screens/TasksScreen";
import StatsScreen from "./src/screens/StatsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import StudyHomeScreen from "./src/screens/StudyHomeScreen";
import CoachScreen from "./src/screens/CoachScreen";
import StudyAIResultScreen from "./src/screens/StudyAIResultScreen";
import StudyChatScreen from "./src/screens/StudyChatScreen";
import SubjectsScreen from "./src/screens/SubjectsScreen";
import MaterialDetailScreen from "./src/screens/MaterialDetailScreen";
import QuizTakeScreen from "./src/screens/QuizTakeScreen";
import FlashcardCollectionsScreen from "./src/screens/FlashcardCollectionsScreen";
import FlashcardCollectionScreen from "./src/screens/FlashcardCollectionScreen";
import FlashcardEditScreen from "./src/screens/FlashcardEditScreen";
import FlashcardStudyScreen from "./src/screens/FlashcardStudyScreen";
import MagicImportScreen from "./src/screens/MagicImportScreen";
import StudyNotesScreen from "./src/screens/StudyNotesScreen";
import NoteEditScreen from "./src/screens/NoteEditScreen";
import NoteViewScreen from "./src/screens/NoteViewScreen";
import NoteImportScreen from "./src/screens/NoteImportScreen";
import CardImportScreen from "./src/screens/CardImportScreen";
import GamifiedQuizScreen from "./src/screens/GamifiedQuizScreen";
import ProgressScreen from "./src/screens/ProgressScreen";
import LeaderboardScreen from "./src/screens/LeaderboardScreen";
import AdminHomeScreen from "./src/screens/AdminHomeScreen";

const AuthStack = createNativeStackNavigator();
const StudentTabs = createBottomTabNavigator();
const StudyStack = createNativeStackNavigator();

function MaintenanceScreen() {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center", padding: 24 }}>
      <View style={{ maxWidth: 420, width: "100%", padding: 24, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }}>
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: "700", textAlign: "center", marginBottom: 12 }}>
          System Maintenance
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 14, lineHeight: 22, textAlign: "center" }}>
          FocusFlow is temporarily unavailable while the admin performs maintenance. Please try again later.
        </Text>
      </View>
    </View>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator
      initialRouteName="Home"
      screenOptions={{ headerShown: false, animation: "none" }}
    >
      <AuthStack.Screen name="Home" component={HomeScreen} />
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Signup" component={SignupScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <AuthStack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
    </AuthStack.Navigator>
  );
}

function StudyNavigator() {
  return (
    <StudyStack.Navigator screenOptions={{ headerShown: false }}>
      <StudyStack.Screen name="StudyHome" component={StudyHomeScreen} />
      <StudyStack.Screen name="Coach" component={CoachScreen} />
      <StudyStack.Screen name="StudyAI" component={StudyAIResultScreen} />
      <StudyStack.Screen name="StudyChat" component={StudyChatScreen} />
      <StudyStack.Screen name="Subjects" component={SubjectsScreen} />
      <StudyStack.Screen name="Material" component={MaterialDetailScreen} />
      <StudyStack.Screen name="Quiz" component={QuizTakeScreen} />
      <StudyStack.Screen name="Flashcards" component={FlashcardCollectionsScreen} />
      <StudyStack.Screen name="FlashcardCollection" component={FlashcardCollectionScreen} />
      <StudyStack.Screen name="FlashcardEdit" component={FlashcardEditScreen} />
      <StudyStack.Screen name="FlashcardStudy" component={FlashcardStudyScreen} />
      <StudyStack.Screen name="MagicImport" component={MagicImportScreen} />
      <StudyStack.Screen name="Notes" component={StudyNotesScreen} />
      <StudyStack.Screen name="NoteEdit" component={NoteEditScreen} />
<StudyStack.Screen name="NoteView" component={NoteViewScreen} />
      <StudyStack.Screen name="NoteImport" component={NoteImportScreen} />
      <StudyStack.Screen name="CardImport" component={CardImportScreen} />
      <StudyStack.Screen name="GamifiedQuiz" component={GamifiedQuizScreen} />
      <StudyStack.Screen name="Progress" component={ProgressScreen} />
      <StudyStack.Screen name="Leaderboard" component={LeaderboardScreen} />
    </StudyStack.Navigator>
  );
}

// Students get the familiar tab layout. Admin accounts land on their own
// dashboard (see AdminHomeScreen) — same login screen, silently different
// destination.
function StudentNavigator() {
  const { colors } = useTheme();
  return (
    <StudentTabs.Navigator
      initialRouteName="Study"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tomato,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "700" },
      }}
    >
      <StudentTabs.Screen
        name="Timer"
        component={TimerScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="timer" color={color} size={size} /> }}
      />
      <StudentTabs.Screen
        name="Tasks"
        component={TasksScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="checkbox" color={color} size={size} /> }}
      />
      <StudentTabs.Screen
        name="Study"
        component={StudyNavigator}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="book" color={color} size={size} /> }}
      />
      <StudentTabs.Screen
        name="Stats"
        component={StatsScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="stats-chart" color={color} size={size} /> }}
      />
      <StudentTabs.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarIcon: ({ color, size }) => <Ionicons name="settings" color={color} size={size} /> }}
      />
    </StudentTabs.Navigator>
  );
}

function RootNavigator() {
  const { user, booting, logout } = useAuth();
  const { colors, isDark } = useTheme();
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  useEffect(() => {
    if (!user || user.role === "ADMIN") {
      setMaintenanceMode(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const { data } = await client.get("/auth/system-status");
        if (!cancelled) {
          const inMaintenance = Boolean(data?.maintenanceMode);
          setMaintenanceMode(inMaintenance);
          if (inMaintenance) {
            await logout();
          }
        }
      } catch (e) {
        if (!cancelled) setMaintenanceMode(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, logout]);

  const navTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      background: colors.bg,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      primary: colors.tomato,
    },
  };

  if (booting) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.tomato} />
      </View>
    );
  }

  if (maintenanceMode) {
    return <MaintenanceScreen />;
  }

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={isDark ? "light" : "dark"} />
      {!user ? (
        <AuthNavigator />
      ) : user.role === "ADMIN" ? (
        <AdminHomeScreen />
      ) : (
        <StudentNavigator />
      )}
    </NavigationContainer>
  );
}

export default function App() {
  useEffect(() => {
    flushQueue().catch(() => {});

    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        flushQueue().catch(() => {});
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}
