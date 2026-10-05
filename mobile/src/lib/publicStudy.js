import { Alert } from "react-native";
import client from "../api/client";
import { fetchHeartsState, formatRefillClock, isHeartsBlocked } from "./hearts";

async function assertHeartsAvailable(navigation) {
  try {
    const state = await fetchHeartsState(client);
    if (!isHeartsBlocked(state)) return true;
    const when = formatRefillClock(state.heartsRefillAt);
    Alert.alert(
      "Quiz unavailable",
      `You're out of hearts. They refill ${when ? `at ${when}` : "in 24 hours"}, or spend 5 coins in Progress to revive one.`,
      [
        { text: "Not now", style: "cancel" },
        { text: "Open Progress", onPress: () => navigation.navigate("Progress") },
      ]
    );
    return false;
  } catch {
    return true;
  }
}

export function openGeneratedQuiz(navigation, data, topicFallback = "Quiz") {
  const questions = data?.questions || [];
  if (!questions.length) {
    throw new Error("No quiz questions were returned.");
  }
  navigation.navigate("GamifiedQuiz", {
    topic: data.topic || topicFallback,
    questions,
    answerKey: data.answerKey || [],
  });
}

export async function startDeckQuiz(navigation, collection, { onStart, onFinish } = {}) {
  const collectionId = collection?.id;
  if (!collectionId) return;
  const cardCount = collection._count?.flashcards ?? collection.cardCount ?? collection.flashcards?.length ?? 0;
  if (cardCount <= 0) {
    Alert.alert("No cards yet", "This public deck does not have flashcards to quiz.");
    return;
  }
  if (!(await assertHeartsAvailable(navigation))) return;
  onStart?.(collectionId);
  try {
    const { data } = await client.get(`/flashcards/collections/${collectionId}/study/quiz`, {
      params: { count: 10 },
    });
    openGeneratedQuiz(navigation, data, collection.name || "Flashcard quiz");
  } catch (e) {
    Alert.alert("Unable to start quiz", e?.response?.data?.error || e.message || "Please try again.");
  } finally {
    onFinish?.();
  }
}

export async function startNoteQuiz(navigation, note, { onStart, onFinish } = {}) {
  const noteId = note?.id;
  if (!noteId) return;
  if (!(await assertHeartsAvailable(navigation))) return;
  onStart?.(noteId);
  try {
    const { data } = await client.post(`/notes/${noteId}/quiz`);
    openGeneratedQuiz(navigation, data, note.title || "Note quiz");
  } catch (e) {
    Alert.alert("Unable to start quiz", e?.response?.data?.error || e.message || "Please try again.");
  } finally {
    onFinish?.();
  }
}
