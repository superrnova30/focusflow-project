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

/** Turn raw flashcard rows into memorize question objects (typing fallback). */
export function cardsToMemorizeQuestions(cards = []) {
  return cards.map((card, idx) => ({
    id: `${card.id}-m${idx}`,
    cardId: card.id,
    question: card.front,
    answer: card.back,
    type: "typing",
  }));
}

/** Accept both new (`questions`) and legacy (`cards`) memorize API payloads. */
export function normalizeMemorizePayload(data) {
  if (Array.isArray(data?.questions) && data.questions.length > 0) {
    return { questions: data.questions, game: data.game || null, lightningSeconds: data.lightningSeconds || 15 };
  }
  if (Array.isArray(data?.cards) && data.cards.length > 0) {
    return {
      questions: cardsToMemorizeQuestions(data.cards),
      game: data.game || null,
      lightningSeconds: data.lightningSeconds || 15,
    };
  }
  return { questions: [], game: data?.game || null, lightningSeconds: data?.lightningSeconds || 15 };
}
