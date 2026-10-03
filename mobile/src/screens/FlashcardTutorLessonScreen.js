import React, { useState, useEffect, useMemo, useLayoutEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "../components/Screen";
import { useTheme } from "../context/ThemeContext";
import client from "../api/client";
import { handleLimitError } from "../lib/upgradePrompt";
import { resolveCollectionId } from "../lib/collectionStudy";
import { RADIUS, SPACING } from "../theme/theme";

export default function FlashcardTutorLessonScreen({ route, navigation }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const collectionId = resolveCollectionId(route.params);
  const collection = route.params?.collection;

  const [loading, setLoading] = useState(true);
  const [lesson, setLesson] = useState(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      title: "AI Tutor Lesson",
      headerTitleStyle: { fontWeight: "800", fontSize: 17 },
      headerBackTitle: "Modes",
      headerTintColor: colors.text,
      headerStyle: { backgroundColor: colors.bg },
    });
  }, [navigation, colors.text, colors.bg]);

  useEffect(() => {
    if (!collectionId) {
      setLoading(false);
      return;
    }
    client
      .post(`/flashcards/collections/${collectionId}/study/tutor-lesson`)
      .then(({ data }) => setLesson(data.lesson))
      .catch((e) => {
        if (!handleLimitError(navigation, e)) {
          Alert.alert("Error", e?.response?.data?.error || e.message);
        }
      })
      .finally(() => setLoading(false));
  }, [collectionId]);

  const steps = lesson?.steps || [];
  const currentStep = steps[stepIndex];
  const isLast = stepIndex >= steps.length - 1;

  const finishLesson = async () => {
    setSubmitting(true);
    try {
      await client.post(`/flashcards/collections/${collectionId}/study/tutor-lesson/complete`);
      setCompleted(true);
    } catch (e) {
      Alert.alert("Error", e?.response?.data?.error || e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = () => {
    if (isLast) {
      finishLesson();
      return;
    }
    setStepIndex((i) => i + 1);
  };

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.mint} size="large" />
          <Text style={styles.muted}>Building your tutor lesson…</Text>
        </View>
      </Screen>
    );
  }

  if (completed) {
    return (
      <Screen>
        <View style={styles.center}>
          <View style={[styles.resultIcon, { backgroundColor: colors.mintSoft }]}>
            <Ionicons name="school" size={44} color={colors.mint} />
          </View>
          <Text style={styles.resultTitle}>Lesson complete</Text>
          <Text style={styles.muted}>
            You finished the AI tutor lesson for {collection?.name || "this deck"}. Review the deck with Memorize or Practice Test next.
          </Text>
          <Pressable
            onPress={() => navigation.goBack()}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.mint }, pressed && styles.pressed]}
          >
            <Text style={styles.primaryBtnText}>Back to study modes</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (!currentStep) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.muted}>Could not load lesson steps.</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.progressPill, { backgroundColor: colors.mintSoft }]}>
          <Text style={[styles.progressText, { color: colors.mint }]}>
            Step {stepIndex + 1} of {steps.length}
          </Text>
        </View>

        <Text style={styles.lessonTitle}>{lesson?.title || collection?.name}</Text>

        <View style={[styles.stepCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={styles.stepTitle}>{currentStep.title}</Text>
          <Text style={styles.stepContent}>{currentStep.content}</Text>
          {currentStep.tip ? (
            <View style={[styles.tipBox, { backgroundColor: colors.amberSoft, borderColor: colors.amber }]}>
              <Ionicons name="bulb-outline" size={16} color={colors.amber} />
              <Text style={[styles.tipText, { color: colors.text }]}>{currentStep.tip}</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.stepDots}>
          {steps.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: i <= stepIndex ? colors.mint : colors.border,
                  width: i === stepIndex ? 18 : 8,
                },
              ]}
            />
          ))}
        </View>

        <View style={styles.actions}>
          {stepIndex > 0 ? (
            <Pressable
              onPress={() => setStepIndex((i) => i - 1)}
              style={({ pressed }) => [styles.secondaryBtn, { borderColor: colors.border }, pressed && styles.pressed]}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.text }]}>Previous</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={goNext}
            disabled={submitting}
            style={({ pressed }) => [styles.primaryBtn, { backgroundColor: colors.mint, flex: 1 }, pressed && styles.pressed]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>{isLast ? "Complete lesson" : "Next step"}</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    scroll: {
      paddingTop: SPACING.md,
      paddingBottom: SPACING.xl * 2,
    },
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: SPACING.lg,
      gap: SPACING.md,
    },
    muted: {
      color: colors.textMuted,
      fontSize: 14,
      textAlign: "center",
      lineHeight: 20,
    },
    progressPill: {
      alignSelf: "flex-start",
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: RADIUS.pill,
      marginBottom: SPACING.md,
    },
    progressText: {
      fontSize: 12,
      fontWeight: "800",
    },
    lessonTitle: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "900",
      letterSpacing: -0.3,
      marginBottom: SPACING.lg,
    },
    stepCard: {
      borderWidth: 1,
      borderRadius: RADIUS.lg,
      padding: SPACING.lg,
      marginBottom: SPACING.lg,
    },
    stepTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: "800",
      marginBottom: SPACING.sm,
    },
    stepContent: {
      color: colors.text,
      fontSize: 15,
      lineHeight: 23,
    },
    tipBox: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 8,
      borderWidth: 1,
      borderRadius: RADIUS.md,
      padding: SPACING.md,
      marginTop: SPACING.lg,
    },
    tipText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 19,
    },
    stepDots: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      marginBottom: SPACING.lg,
    },
    dot: {
      height: 8,
      borderRadius: 4,
    },
    actions: {
      flexDirection: "row",
      gap: SPACING.sm,
    },
    primaryBtn: {
      height: 48,
      borderRadius: RADIUS.md,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
    },
    primaryBtnText: {
      color: "#fff",
      fontWeight: "800",
      fontSize: 15,
    },
    secondaryBtn: {
      height: 48,
      borderRadius: RADIUS.md,
      borderWidth: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
    },
    secondaryBtnText: {
      fontWeight: "700",
      fontSize: 14,
    },
    resultIcon: {
      width: 88,
      height: 88,
      borderRadius: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    resultTitle: {
      color: colors.text,
      fontSize: 22,
      fontWeight: "900",
    },
    pressed: {
      opacity: 0.85,
    },
  });
