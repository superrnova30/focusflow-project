import {
  buildValidatedMcqOptions,
  canonicalAnswer,
  displayHighlight,
  parseHighlights,
  serializeHighlights,
} from "./flashcardAnswer";

/** Keep deck cards in a stable creation order so edits do not move a card. */
export function sortDeckCards(cards = []) {
  return [...cards].sort((a, b) => String(a?.id || "").localeCompare(String(b?.id || "")));
}

/** Resolve collection id from navigation params (supports multiple shapes). */
export function resolveCollectionId(params = {}) {
  return params.collectionId || params.collection?.id || null;
}

/** Best-effort card count from a collection object passed through navigation. */
export function resolveCardCount(collection) {
  if (!collection) return 0;
  if (typeof collection._count?.flashcards === "number") return collection._count.flashcards;
  if (Array.isArray(collection.flashcards)) return collection.flashcards.length;
  if (typeof collection.cardCount === "number") return collection.cardCount;
  return 0;
}

export const DEFAULT_MEMORIZE_SETTINGS = {
  questionStyle: "mixed",
  hideOptionsInitially: true,
  lightningRounds: false,
  spellingMistakesAllowed: true,
};

export function pickQuestionType(style, seed) {
  if (style === "mcq") return "mcq";
  if (style === "typing") return "typing";
  if (style === "flashcards") return "flashcard";
  const types = ["mcq", "typing", "flashcard"];
  return types[Math.abs(Number(seed) || 0) % types.length];
}

function shuffleCopy(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function buildMcqOptionsFromAnswers(answers, correct, question = "", back = "") {
  return shuffleCopy(buildValidatedMcqOptions(question, correct, answers, back));
}

/** Restyle unanswered questions to match the selected study preference. */
export function applyQuestionStyle(questions = [], questionStates = [], style = "mixed") {
  const answers = questions.map((question) => question.answer);
  return questions.map((question, idx) => {
    if (questionStates[idx]?.answered) return question;
    const type = pickQuestionType(style || "mixed", idx + String(question.question || "").length);
    const next = { ...question, type };
    if (type === "mcq") {
      next.options =
        question.type === "mcq" && Array.isArray(question.options) && question.options.length >= 2
          ? question.options
          : buildMcqOptionsFromAnswers(answers, question.answer, question.question, question.back);
    } else {
      next.options = undefined;
    }
    return next;
  });
}

/** Turn raw flashcard rows into memorize question objects. */
export function cardsToMemorizeQuestions(cards = [], style = "mixed") {
  const questions = cards.map((card, idx) => {
    const answer = canonicalAnswer(card);
    return {
      id: `${card.id}-m${idx}`,
      cardId: card.id,
      question: card.front,
      answer,
      back: card.back,
      answerHighlight: serializeHighlights(parseHighlights(card.answerHighlight, card.back), card.back) || displayHighlight(card),
      explanation: card.explanation || "",
      type: "typing",
    };
  });
  return applyQuestionStyle(questions, questions.map(() => ({ answered: false })), style);
}

/** Accept both new (`questions`) and legacy (`cards`) memorize API payloads. */
export function normalizeMemorizePayload(data) {
  if (Array.isArray(data?.questions) && data.questions.length > 0) {
    return { questions: data.questions, game: data.game || null, lightningSeconds: data.lightningSeconds || 15 };
  }
  if (Array.isArray(data?.cards) && data.cards.length > 0) {
    return {
      questions: cardsToMemorizeQuestions(data.cards, data.game?.settings?.questionStyle),
      game: data.game || null,
      lightningSeconds: data.lightningSeconds || 15,
    };
  }
  return { questions: [], game: data?.game || null, lightningSeconds: data?.lightningSeconds || 15 };
}
