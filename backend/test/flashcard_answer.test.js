const test = require("node:test");
const assert = require("node:assert/strict");

const {
  snapHighlightToBack,
  highlightFromSelection,
  tokenizeAnswer,
  phraseFromTokenRange,
  parseHighlights,
  serializeHighlights,
  addHighlightSpan,
  removeHighlightAt,
  remapHighlights,
  resolveSavedHighlight,
  pickAnswerHighlight,
  displayHighlight,
  canonicalAnswer,
  buildFirstLetterClue,
  normalizeImportedCard,
  finalizeGeneratedCard,
  normalizeGeneratedCards,
  sanitizeTutorQuestion,
  assembleTutorCard,
  fallbackQuestionsForCard,
  buildTutorWhy,
  explainTutorChoice,
  finalizeTutorQuestion,
  findExactOption,
  eliminateOneIncorrectOption,
  tutorQuestionIsSound,
  questionsAreReversals,
  pickAlternateTutorAnswer,
  pickBestAnswerForQuestion,
  resolveTutorAnswerKey,
  isGenericTutorPrompt,
  isMetaChoice,
  viableAnswerOptions,
  summarizedAnswer,
  buildValidatedMcqOptions,
  sanitizeQuizList,
} = require("../src/lib/flashcardAnswer");

const JAVA_BACK =
  "A high-level, class-based, object-oriented programming language designed to have as few implementation dependencies as possible.";

function assertNotFragment(highlight) {
  assert.equal(/\b(?:the|a|an|of|to|and|or)$/i.test(highlight), false);
  assert.equal(/^(?:the|a|an)\s+\w+$/i.test(highlight), false);
}

test("snapHighlightToBack keeps the highlight inside the actual answer", () => {
  assert.equal(snapHighlightToBack("The mitochondria is the powerhouse of the cell.", "mitochondria"), "mitochondria");
  assert.equal(snapHighlightToBack("The mitochondria is the powerhouse of the cell.", "chloroplast"), "");
});

test("AI highlight is preferred when it is a complete substring of the back", () => {
  assert.equal(
    pickAnswerHighlight("What is Java?", JAVA_BACK, "programming language"),
    "programming language"
  );
});

test("does not highlight the entire definition when the key phrase can be extracted", () => {
  const highlight = pickAnswerHighlight("What is Java?", JAVA_BACK, "");
  assert.equal(highlight, "programming language");
  assert.notEqual(highlight, JAVA_BACK);
});

test("rejects incomplete, irrelevant, or question-echo AI highlights", () => {
  assert.equal(
    pickAnswerHighlight(
      "What is the powerhouse of the cell?",
      "The mitochondria is the powerhouse of the cell.",
      "the cell"
    ),
    "mitochondria"
  );
  assert.equal(
    pickAnswerHighlight("What is Java?", JAVA_BACK, "class-based"),
    "programming language"
  );
  assert.equal(
    pickAnswerHighlight("What is Java?", JAVA_BACK, "A high-level, class-based"),
    "programming language"
  );
  assert.equal(
    pickAnswerHighlight(
      "What is osmosis?",
      "The movement of water across a membrane.",
      "The movement of"
    ),
    "movement of water"
  );
});

test("canonicalAnswer never returns a phrase that is not in the card back", () => {
  const card = { back: "Water boils at 100°C.", answerHighlight: "100°C" };
  assert.equal(canonicalAnswer(card), "100°C");
  assert.equal(
    canonicalAnswer({
      front: "What is the powerhouse of the cell?",
      back: "The mitochondria is the powerhouse of the cell.",
      answerHighlight: "Diffusion",
    }),
    "mitochondria"
  );
  assert.equal(canonicalAnswer({ back: "Osmosis" }), "Osmosis");
});

test("clue uses the first letter of the highlighted phrase", () => {
  assert.equal(buildFirstLetterClue("programming language"), 'Clue: starts with "P"');
  assert.equal(buildFirstLetterClue("mitochondria"), 'Clue: starts with "M"');
  assert.equal(buildFirstLetterClue("100°C"), 'Clue: starts with "1"');
  assert.equal(
    buildFirstLetterClue(
      canonicalAnswer({
        front: "What is Java?",
        back: JAVA_BACK,
        answerHighlight: "programming language",
      })
    ),
    'Clue: starts with "P"'
  );
});

test("imported cards extract a key phrase instead of highlighting a wrong or full answer", () => {
  const back = "The movement of water across a membrane.";
  const picked = pickAnswerHighlight("What is osmosis?", back, "photosynthesis");
  assert.equal(picked, "movement of water");
  const card = normalizeImportedCard({
    front: "What is osmosis?",
    back,
    answerHighlight: "photosynthesis",
    explanation: "Water moves from high to low concentration.",
  });
  assert.equal(card.answerHighlight, "movement of water");
  assert.notEqual(card.answerHighlight, card.back);
  assert.equal(card.explanation.startsWith("Water"), true);
});

test("highlights stay complete across definition, who, when, and where questions", () => {
  assert.equal(
    pickAnswerHighlight(
      "What is mitochondria?",
      "The mitochondria is the powerhouse of the cell.",
      ""
    ),
    "powerhouse of the cell"
  );
  assert.equal(
    pickAnswerHighlight(
      "Who discovered penicillin?",
      "Alexander Fleming discovered penicillin in 1928.",
      ""
    ),
    "Alexander Fleming"
  );
  assert.equal(
    pickAnswerHighlight("When did World War II end?", "World War II ended in 1945.", ""),
    "1945"
  );
  assert.equal(
    pickAnswerHighlight(
      "Where is the Eiffel Tower located?",
      "The Eiffel Tower is in Paris, France.",
      ""
    ),
    "Paris, France"
  );
  assert.equal(
    pickAnswerHighlight(
      "How many planets are in the solar system?",
      "There are 8 planets in the solar system.",
      ""
    ),
    "8"
  );
});

test("skips highlighting when no complete answering phrase is confident", () => {
  const front = "Why do plants look green?";
  const back = "Chlorophyll absorbs light to perform photosynthesis in plant cells.";
  assert.equal(pickAnswerHighlight(front, back, ""), "");
  assert.equal(pickAnswerHighlight(front, back, "To perform"), "");
  assert.equal(displayHighlight({ front, back, answerHighlight: "missing phrase" }), "");
  const summary = summarizedAnswer({ front, back, answerHighlight: "missing phrase" });
  assert.ok(summary);
  assert.ok(back.toLowerCase().includes(summary.toLowerCase()));
  assert.notEqual(summary.toLowerCase(), "to perform");
});

test("click-drag selection expands to whole words in the answer", () => {
  const idx = JAVA_BACK.indexOf("programming");
  assert.equal(highlightFromSelection(JAVA_BACK, idx + 3, idx + 8), "programming");
  assert.equal(
    highlightFromSelection(JAVA_BACK, idx, JAVA_BACK.indexOf("language") + "language".length),
    "programming language"
  );
  assert.equal(highlightFromSelection(JAVA_BACK, 0, 0), "");
});

test("clicking a word or dragging across words builds a saved highlight", () => {
  const text = "Plants convert sunlight into energy.";
  const tokens = tokenizeAnswer(text);
  assert.equal(tokens[0].text, "Plants");
  assert.equal(phraseFromTokenRange(text, 2, 2), "sunlight");
  assert.equal(phraseFromTokenRange(text, 2, 4), "sunlight into energy");
  assert.equal(resolveSavedHighlight("What do plants convert?", text, "sunlight"), "sunlight");
  assert.equal(resolveSavedHighlight("What do plants convert?", text, "sunlight into energy"), "sunlight into energy");
});

test("new highlights are added without resetting existing ones", () => {
  const text = "Plants convert sunlight into energy.";
  const first = addHighlightSpan(text, "", { start: text.indexOf("sunlight"), end: text.indexOf("sunlight") + 8, text: "sunlight" });
  const second = addHighlightSpan(text, first, { start: text.indexOf("energy"), end: text.indexOf("energy") + 6, text: "energy" });
  const spans = parseHighlights(second, text);
  assert.equal(spans.length, 2);
  assert.equal(spans[0].text, "sunlight");
  assert.equal(spans[1].text, "energy");
  const again = addHighlightSpan(text, second, spans[0]);
  assert.equal(parseHighlights(again, text).length, 2);
  const removed = parseHighlights(removeHighlightAt(text, second, 0), text);
  assert.equal(removed.length, 1);
  assert.equal(removed[0].text, "energy");
});

test("repeated words keep independent highlight positions", () => {
  const text = "the cat saw the dog.";
  const firstThe = 0;
  const secondThe = text.lastIndexOf("the");
  const saved = addHighlightSpan(text, "", { start: secondThe, end: secondThe + 3, text: "the" });
  const spans = parseHighlights(saved, text);
  assert.equal(spans.length, 1);
  assert.equal(spans[0].start, secondThe);
  const extra = addHighlightSpan(text, saved, { start: firstThe, end: firstThe + 3, text: "the" });
  assert.equal(parseHighlights(extra, text).length, 2);
});

test("editing other words keeps existing highlights", () => {
  const original = "Plants convert sunlight into energy.";
  const stored = serializeHighlights(
    [
      { start: original.indexOf("sunlight"), end: original.indexOf("sunlight") + 8, text: "sunlight" },
      { start: original.indexOf("energy"), end: original.indexOf("energy") + 6, text: "energy" },
    ],
    original
  );
  const edited = "Green plants convert sunlight into energy daily.";
  const remapped = parseHighlights(remapHighlights(original, edited, stored), edited);
  assert.equal(remapped.length, 2);
  assert.equal(remapped[0].text, "sunlight");
  assert.equal(remapped[1].text, "energy");
});

test("saved user highlights are kept even when heuristics would reject them", () => {
  assert.equal(
    resolveSavedHighlight("What is Java?", JAVA_BACK, "programming language"),
    "programming language"
  );
  assert.equal(resolveSavedHighlight("What is Java?", JAVA_BACK, ""), "");
  assert.equal(resolveSavedHighlight("What is Java?", JAVA_BACK, "class-based"), "class-based");
  assert.equal(
    displayHighlight({ front: "What is Java?", back: JAVA_BACK, answerHighlight: "class-based" }),
    "class-based"
  );
  assert.equal(
    displayHighlight({ front: "What is Java?", back: JAVA_BACK, answerHighlight: "programming language" }),
    "programming language"
  );
  assert.equal(resolveSavedHighlight("What is Java?", JAVA_BACK, "not in the card"), "programming language");
});

test("the same phrase is used for display, memorize answer, and tutor clue", () => {
  const card = {
    front: "What is Java?",
    back: JAVA_BACK,
    answerHighlight: "programming language",
  };
  const phrase = displayHighlight(card);
  assert.equal(phrase, "programming language");
  assert.equal(canonicalAnswer(card), phrase);
  assert.equal(buildFirstLetterClue(canonicalAnswer(card)), 'Clue: starts with "P"');
  assertNotFragment(phrase);
});

test("generated cards store a complete highlight separately from the full answer", () => {
  const card = finalizeGeneratedCard({
    front: "What is Java?",
    back: JAVA_BACK,
    answerHighlight: "",
  });
  assert.equal(card.answerHighlight, "programming language");
  assert.notEqual(card.answerHighlight, card.back);
  assert.equal(card.back.includes(card.answerHighlight), true);
});

test("generation revises unstructured cards instead of highlighting a fragment", () => {
  const card = finalizeGeneratedCard({
    front: "Why do plants look green?",
    back: "Chlorophyll absorbs light to perform photosynthesis in plant cells.",
    answerHighlight: "To perform",
  });
  assert.equal(card.answerHighlight, "Chlorophyll");
  assert.equal(card.back.includes("Chlorophyll"), true);
});

test("generation rewrites explain-cards into a definition with a usable highlight", () => {
  const card = finalizeGeneratedCard({
    front: "Explain photosynthesis",
    back: "Plants use sunlight to make food.",
  });
  assert.ok(card);
  assert.ok(card.answerHighlight);
  assert.equal(card.back.toLowerCase().includes(card.answerHighlight.toLowerCase()), true);
  assert.notEqual(card.answerHighlight.toLowerCase(), "plants");
  assert.equal(card.front.toLowerCase().includes("photosynthesis"), true);
});

test("generation drops cards that cannot be repaired instead of saving a bad highlight", () => {
  const weak = {
    front: "Discuss the implications",
    back: "There are many related points to consider when reviewing this material in context of the course.",
  };
  assert.equal(finalizeGeneratedCard(weak), null);
  const cards = normalizeGeneratedCards([
    { front: "What is Java?", back: JAVA_BACK },
    weak,
  ]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].answerHighlight, "programming language");
});

test("expands one-word AI highlights into the full 2-4 word answering phrase", () => {
  assert.equal(pickAnswerHighlight("What is Java?", JAVA_BACK, "language"), "programming language");
  assert.equal(
    pickAnswerHighlight(
      "What is osmosis?",
      "The movement of water across a membrane.",
      "movement"
    ),
    "movement of water"
  );
});

test("quiz and memorize answers stay a short factual summary of the highlight", () => {
  const card = {
    front: "What is Java?",
    back: JAVA_BACK,
    answerHighlight: "programming language",
  };
  assert.equal(summarizedAnswer(card), "programming language");
  assert.equal(canonicalAnswer(card), "programming language");
});

test("MCQ options stay on-topic and keep exactly one correct answer", () => {
  const options = buildValidatedMcqOptions(
    "What is Java?",
    "programming language",
    ["markup language", "database system", "operating system", "programming language", "A random detail"],
    JAVA_BACK
  );
  assert.equal(options.includes("programming language"), true);
  assert.equal(options.includes("A random detail"), false);
  assert.equal(options.filter((item) => item.toLowerCase() === "programming language").length, 1);
  assert.ok(options.length >= 2);
  options.forEach((item) => {
    assert.equal(/random detail|unrelated|none of the above/i.test(item), false);
  });
});

test("generated quiz items drop generic filler and keep one correct option", () => {
  const quiz = sanitizeQuizList([
    {
      type: "mcq",
      question: "What is the powerhouse of the cell?",
      options: ["mitochondria", "nucleus", "chloroplast", "A random detail"],
      answer: "mitochondria",
    },
  ]);
  assert.equal(quiz.length, 1);
  assert.equal(quiz[0].answer.toLowerCase(), "mitochondria");
  assert.equal(quiz[0].options.includes("A random detail"), false);
  assert.ok(quiz[0].options.includes(quiz[0].answer));
});

test("tutor questions cannot mark the highlighted answer as a distractor", () => {
  const card = { front: "Powerhouse of the cell?", back: "The mitochondria.", answerHighlight: "mitochondria" };
  const question = sanitizeTutorQuestion(
    {
      question: "What is the correct answer?",
      options: ["nucleus", "mitochondria", "chloroplast", "ribosome"],
      answer: "nucleus",
    },
    card,
    []
  );
  assert.equal(question.answer.toLowerCase(), "mitochondria");
  assert.equal(question.options.includes(question.answer), true);
});

test("each tutor card gets two questions with different on-topic answers", () => {
  const card = {
    id: "java-1",
    front: "What is Java?",
    back: JAVA_BACK,
    answerHighlight: "programming language",
  };
  const assembled = assembleTutorCard(card, [], {
    questions: [
      {
        question: "What is Java?",
        options: ["programming language", "markup language", "database", "operating system"],
        answer: "programming language",
      },
      {
        question: "What is Java?",
        options: ["programming language", "markup language", "database", "operating system"],
        answer: "programming language",
      },
    ],
  });
  assert.equal(assembled.questions.length, 2);
  assert.equal(assembled.questions[0].answer.toLowerCase(), "programming language");
  assert.notEqual(assembled.questions[1].answer.toLowerCase(), assembled.questions[0].answer.toLowerCase());
  assert.equal(questionsAreReversals(assembled.questions[0], assembled.questions[1]), false);
  assert.equal(/defined as/i.test(assembled.questions[1].question), false);
  assert.notEqual(assembled.questions[0].question.toLowerCase(), assembled.questions[1].question.toLowerCase());
  assembled.questions.forEach((question) => {
    assert.equal(question.options.filter((item) => item.toLowerCase() === question.answer.toLowerCase()).length, 1);
    assert.equal(question.options.length, 4);
    assert.equal(question.options.includes("A random detail"), false);
  });
});

test("fallback tutor questions stay on topic and use two different answers", () => {
  const card = {
    front: "What is Java?",
    back: JAVA_BACK,
    answerHighlight: "programming language",
  };
  const questions = fallbackQuestionsForCard(card, []);
  assert.equal(questions.length, 2);
  assert.notEqual(questions[0].answer.toLowerCase(), questions[1].answer.toLowerCase());
  assert.equal(questionsAreReversals(questions[0], questions[1]), false);
  assert.ok(JAVA_BACK.toLowerCase().includes(questions[0].answer.toLowerCase()) || /java/i.test(questions[0].answer));
  assert.ok(JAVA_BACK.toLowerCase().includes(questions[1].answer.toLowerCase()) || /java/i.test(questions[1].answer));
  assert.equal(isGenericTutorPrompt(questions[0].question), false);
  assert.equal(isGenericTutorPrompt(questions[1].question), false);
});

test("alternate tutor answer comes from the same card, not an off-topic option", () => {
  const card = {
    front: "What is Java?",
    back: JAVA_BACK,
    answerHighlight: "programming language",
  };
  const offTopic = pickAlternateTutorAnswer(card, "programming language", "nucleus");
  assert.notEqual(offTopic.toLowerCase(), "nucleus");
  assert.ok(JAVA_BACK.toLowerCase().includes(offTopic.toLowerCase()) || /java/i.test(offTopic));
  const fromGenerated = pickAlternateTutorAnswer(card, "programming language", "Java");
  assert.ok(JAVA_BACK.toLowerCase().includes(fromGenerated.toLowerCase()) || /java/i.test(fromGenerated));
});

test("tutor hint eliminates exactly one incorrect option and never the answer", () => {
  const options = ["mitochondria", "nucleus", "chloroplast", "ribosome"];
  const first = eliminateOneIncorrectOption(options, "mitochondria");
  assert.equal(options.includes(first), true);
  assert.notEqual(first.toLowerCase(), "mitochondria");
  const second = eliminateOneIncorrectOption(options, "mitochondria", [first]);
  assert.notEqual(second, first);
  assert.notEqual(second.toLowerCase(), "mitochondria");
  const third = eliminateOneIncorrectOption(options, "mitochondria", [first, second]);
  assert.equal(["nucleus", "chloroplast", "ribosome"].includes(third), true);
  assert.equal([first, second].includes(third), false);
  assert.equal(eliminateOneIncorrectOption(options, "mitochondria", [first, second, third]), "");
});

test("tutor questions do not reverse the same definition and term", () => {
  const card = {
    id: "gun-1",
    front: "What is a firearm?",
    back: "A weapon that discharges one or more projectiles.",
    answerHighlight: "discharges one or more",
  };
  const assembled = assembleTutorCard(card, [], {
    questions: [
      {
        question: "Which term on this card is defined as \"discharges one or more\"?",
        options: ["Firearm", "Ammunition", "Holster", "Target"],
        answer: "Firearm",
      },
      {
        question: "What is a firearm?",
        options: ["discharges one or more", "stores gunpowder", "is a type of holster", "is only a target"],
        answer: "discharges one or more",
      },
    ],
  });
  assert.equal(questionsAreReversals(assembled.questions[0], assembled.questions[1]), false);
  assert.equal(/defined as/i.test(assembled.questions[0].question + assembled.questions[1].question), false);
  assert.notEqual(assembled.questions[0].question.toLowerCase(), assembled.questions[1].question.toLowerCase());
  assembled.questions.forEach((question) => {
    assert.equal(question.options.filter((item) => item.toLowerCase() === question.answer.toLowerCase()).length, 1);
  });
});

test("tutor answer key matches the question meaning, not a flashcard keyword", () => {
  const card = {
    front: "What is a weapon?",
    back: "A weapon is used to inflict physical damage, harm, or death on living creatures or structures.",
    answerHighlight: "weapon",
  };
  const question = sanitizeTutorQuestion(
    {
      question: "What is the primary purpose of a weapon when utilized against living creatures or structures?",
      options: [
        "to provide structural architectural support",
        "to inflict physical damage, harm, or death",
        "weapon",
        "to enhance communication networks",
      ],
      answer: "weapon",
    },
    card,
    [],
    { preferredAnswer: "weapon" }
  );
  assert.match(question.answer.toLowerCase(), /inflict|damage|harm|death/);
  assert.notEqual(question.answer.toLowerCase(), "weapon");
  const picked = pickBestAnswerForQuestion(
    "What is the primary purpose of a weapon when utilized against living creatures or structures?",
    [
      "to provide structural architectural support",
      "to inflict physical damage, harm, or death",
      "weapon",
      "to enhance communication networks",
    ],
    card
  );
  assert.match(String(picked).toLowerCase(), /inflict|damage|harm|death/);
  assert.notEqual(String(picked).toLowerCase(), "weapon");
  assert.equal(question.options.filter((item) => item.toLowerCase() === question.answer.toLowerCase()).length, 1);
});

test("tutor lesson keeps a sound explanation-based second question", () => {
  const card = {
    id: "java-explain",
    front: "What is Java?",
    back: JAVA_BACK,
    answerHighlight: "programming language",
  };
  const assembled = assembleTutorCard(card, [], {
    explanation:
      "Java was designed so programs can run on many computers with as few implementation dependencies as possible. Its class-based object-oriented model organizes code into reusable types.",
    questions: [
      {
        question: "How is Java best described?",
        options: ["programming language", "markup language", "database", "operating system"],
        answer: "programming language",
      },
      {
        question: "What was Java designed to do?",
        options: [
          "to have as few implementation dependencies as possible",
          "to compile only on one operating system",
          "to replace HTML as a markup language",
          "to store relational database records",
        ],
        answer: "to have as few implementation dependencies as possible",
      },
    ],
  });
  assert.equal(assembled.questions.length, 2);
  assert.match(assembled.questions[1].answer.toLowerCase(), /implementation dependencies/);
  assert.match(assembled.questions[1].question.toLowerCase(), /java/);
  assert.match(assembled.questions[1].question.toLowerCase(), /designed|purpose|used|dependenc/);
  assert.notEqual(assembled.questions[0].answer.toLowerCase(), assembled.questions[1].answer.toLowerCase());
  assert.equal(questionsAreReversals(assembled.questions[0], assembled.questions[1]), false);
  assert.equal(isGenericTutorPrompt(assembled.questions[1].question), false);
  assert.equal(assembled.questions[1].options.filter((item) => item.toLowerCase() === assembled.questions[1].answer.toLowerCase()).length, 1);
});

test("second tutor question is specific instead of a generic template", () => {
  const card = {
    id: "java-2",
    front: "What is Java?",
    back: JAVA_BACK,
    answerHighlight: "programming language",
  };
  const assembled = assembleTutorCard(card, [], {
    questions: [
      {
        question: "What is Java?",
        options: ["programming language", "markup language", "database", "operating system"],
        answer: "programming language",
      },
      {
        question: "Which option best applies the idea on this card?",
        options: ["Java", "HTML", "SQL", "Linux"],
        answer: "Java",
      },
    ],
  });
  assert.equal(isGenericTutorPrompt(assembled.questions[1].question), false);
  assert.equal(/best applies the idea on this card/i.test(assembled.questions[1].question), false);
  assert.notEqual(assembled.questions[0].question.toLowerCase(), assembled.questions[1].question.toLowerCase());
  assert.equal(questionsAreReversals(assembled.questions[0], assembled.questions[1]), false);
});

test("tutor questions replace an incorrect or ambiguous AI answer key", () => {
  const card = { front: "What is Java?", back: JAVA_BACK, answerHighlight: "programming language" };
  const question = sanitizeTutorQuestion(
    {
      question: "What is the correct answer?",
      options: ["markup language", "database", "operating system", "compiler"],
      answer: "markup language",
    },
    card,
    []
  );
  assert.equal(question.answer.toLowerCase(), "programming language");
  assert.equal(question.options.filter((item) => item.toLowerCase() === "programming language").length, 1);
  assert.equal(/what is the correct answer/i.test(question.question), false);
  assert.equal(tutorQuestionIsSound(question, card, { preferredAnswer: "programming language" }), true);
});

test("tutor questions include a card-grounded explanation of the correct answer", () => {
  const card = {
    id: "java-why",
    front: "What is Java?",
    back: JAVA_BACK,
    answerHighlight: "programming language",
  };
  const assembled = assembleTutorCard(card, [], {
    explanation:
      "Java is a high-level programming language designed so programs can run with as few implementation dependencies as possible.",
    questions: [
      {
        question: "How is Java best described?",
        options: ["programming language", "markup language", "database", "operating system"],
        answer: "programming language",
        why: "Java is a high-level, class-based programming language.",
      },
      {
        question: "What was Java designed to do?",
        options: [
          "to have as few implementation dependencies as possible",
          "to compile only on one operating system",
          "to replace HTML as a markup language",
          "to store relational database records",
        ],
        answer: "to have as few implementation dependencies as possible",
        why: "Java was designed to have as few implementation dependencies as possible.",
      },
    ],
  });
  assert.equal(assembled.questions.length, 2);
  assembled.questions.forEach((item) => {
    assert.ok(String(item.why || "").length > 20);
    assert.match(item.why.toLowerCase(), /java|programming|dependencies/);
  });
  const why = buildTutorWhy(
    card,
    assembled.questions[0].question,
    assembled.questions[0].answer,
    assembled.questions[0].why
  );
  assert.match(why.toLowerCase(), /programming language|java/);
});

test("tutor feedback explains a wrong keyword on a purpose question", () => {
  const card = {
    front: "What is a weapon?",
    back: "A weapon is used to inflict physical damage, harm, or death on living creatures or structures.",
    answerHighlight: "weapon",
  };
  const question = "What is the primary purpose of a weapon when utilized against living creatures or structures?";
  const correct = "to inflict physical damage, harm, or death";
  const feedback = explainTutorChoice({
    card,
    question,
    correct,
    selected: "weapon",
    why: "A weapon is used to inflict physical damage, harm, or death.",
    revealed: false,
  });
  assert.equal(feedback.title, "Not quite");
  assert.match(feedback.whySelected.toLowerCase(), /weapon/);
  assert.match(feedback.whySelected.toLowerCase(), /purpose|used for|something else|not the purpose/);
  assert.match(feedback.whyCorrect.toLowerCase(), /inflict|damage|harm/);
  assert.equal(/weapon is the (correct|right) answer/i.test(feedback.whyCorrect), false);
  const right = explainTutorChoice({
    card,
    question,
    correct,
    selected: correct,
    why: "A weapon is used to inflict physical damage, harm, or death.",
  });
  assert.equal(right.title, "That's right");
  assert.match(right.whyCorrect.toLowerCase(), /inflict|damage|harm/);
});

test("tutor answer key uses meaning, not a related process keyword", () => {
  const card = {
    id: "product-1",
    front: "What is a product in mathematics?",
    back: "A product is the result obtained when two or more numbers are multiplied together. Multiplication is the operation used to find that result.",
    answerHighlight: "product",
  };
  const question =
    "What term is given to the result obtained when two or more numbers are multiplied together?";
  const options = ["Multiplication", "Product", "Addition", "Quotient"];
  const picked = pickBestAnswerForQuestion(question, options, card);
  assert.match(String(picked).toLowerCase(), /product/);
  assert.notEqual(String(picked).toLowerCase(), "multiplication");
  const sanitized = sanitizeTutorQuestion(
    { question, options, answer: "Multiplication" },
    card,
    [],
    { preferredAnswer: "Multiplication" }
  );
  assert.match(sanitized.answer.toLowerCase(), /product/);
  assert.notEqual(sanitized.answer.toLowerCase(), "multiplication");
  assert.equal(sanitized.options.filter((item) => item.toLowerCase() === sanitized.answer.toLowerCase()).length, 1);
  const resolved = resolveTutorAnswerKey(question, options, card, "Multiplication");
  assert.match(String(resolved).toLowerCase(), /product/);
  const assembled = assembleTutorCard(card, [], {
    questions: [
      {
        question: "How is a product in mathematics best described?",
        options: ["the result of multiplying numbers", "a type of fraction", "a remainder", "an exponent"],
        answer: "the result of multiplying numbers",
      },
      { question, options, answer: "Multiplication" },
    ],
  });
  assert.match(assembled.questions[1].question.toLowerCase(), /result|term|multipl/);
  assert.match(assembled.questions[1].answer.toLowerCase(), /product/);
  assert.notEqual(assembled.questions[1].answer.toLowerCase(), "multiplication");
});

test("tutor result questions distinguish an operation from its result in other subjects", () => {
  const sumCard = {
    front: "What is a sum?",
    back: "A sum is the result obtained when two or more numbers are added together. Addition is the operation.",
    answerHighlight: "sum",
  };
  const sumQuestion = "What term is given to the result obtained when two or more numbers are added together?";
  const sumPicked = pickBestAnswerForQuestion(sumQuestion, ["Addition", "Sum", "Subtraction", "Quotient"], sumCard);
  assert.match(String(sumPicked).toLowerCase(), /sum/);
  assert.notEqual(String(sumPicked).toLowerCase(), "addition");

  const cellCard = {
    front: "What is the powerhouse of the cell?",
    back: "The mitochondria is the organelle known as the powerhouse of the cell.",
    answerHighlight: "mitochondria",
  };
  const cellQuestion = "Which organelle is known as the powerhouse of the cell?";
  const cellPicked = pickBestAnswerForQuestion(
    cellQuestion,
    ["cell", "mitochondria", "nucleus", "ribosome"],
    cellCard
  );
  assert.match(String(cellPicked).toLowerCase(), /mitochondria/);
  assert.notEqual(String(cellPicked).toLowerCase(), "cell");

  const defineCard = {
    front: "What is multiplication?",
    back: "Multiplication is a mathematical operation. The result obtained when two or more numbers are multiplied together is called the product.",
    answerHighlight: "multiplication",
  };
  const defineQuestion = sanitizeTutorQuestion(
    {
      question: "What is multiplication?",
      options: ["Multiplication", "Product", "Addition", "Quotient"],
      answer: "Multiplication",
    },
    defineCard,
    [],
    { preferredAnswer: "multiplication" }
  );
  assert.match(defineQuestion.answer.toLowerCase(), /multiplication/);
});

test("tutor MCQ options reject incomplete stems and near-duplicate choices", () => {
  const card = {
    id: "miya-1",
    front: "What is Miya's primary role in Mobile Legends?",
    back: "Miya primarily plays as a marksman. She is a ranged physical damage dealer who focuses on basic attacks.",
    answerHighlight: "marksman",
  };
  const sanitized = sanitizeTutorQuestion(
    {
      question: "What is Miya's primary role in Mobile Legends?",
      options: [
        "Miya primarily plays as",
        "marksman",
        "Miya primarily plays as a marksman",
        "tank",
        "support",
        "assassin",
      ],
      answer: "Miya primarily plays as",
    },
    card,
    [],
    { preferredAnswer: "marksman" }
  );
  assert.equal(sanitized.options.some((item) => /plays as$/i.test(item)), false);
  assert.equal(sanitized.options.every((item) => !/\b(?:as|to|of|for|a|an|the)$/i.test(item)), true);
  assert.match(sanitized.answer.toLowerCase(), /marksman/);
  assert.notEqual(sanitized.answer.toLowerCase(), "miya primarily plays as");
  assert.equal(sanitized.options.length, 4);
  assert.equal(sanitized.options.filter((item) => /marksman/i.test(item)).length, 1);
  const feedback = explainTutorChoice({
    card,
    question: sanitized.question,
    correct: sanitized.answer,
    selected: "tank",
    why: "Miya primarily plays as a marksman.",
  });
  assert.match(feedback.whyCorrect.toLowerCase(), /marksman/);
  assert.equal(/associated with "miya primarily plays as a marksman"/i.test(feedback.whyCorrect), false);
  assert.equal(/you chose .* which is what this question is asking/i.test(feedback.body), false);
});

test("tutor answer key is pinned to an exact displayed option after shuffle", () => {
  const card = {
    id: "role-pin",
    front: "What is Miya's primary role in Mobile Legends?",
    back: "Miya primarily plays as a marksman. She is a ranged physical damage dealer.",
    answerHighlight: "marksman",
  };
  const locked = finalizeTutorQuestion(
    {
      question: "What is Miya's primary role in Mobile Legends?",
      options: ["tank", "Marksman", "support", "assassin"],
      answer: "marksman",
    },
    card
  );
  assert.equal(findExactOption(locked.options, locked.answer), locked.answer);
  assert.equal(locked.options.includes(locked.answer), true);
  assert.match(locked.answer.toLowerCase(), /^marksman$/);
  assert.equal(locked.question, "What is Miya's primary role in Mobile Legends?");

  const assembled = assembleTutorCard(card, [], {
    questions: [
      {
        question: "What is Miya's primary role in Mobile Legends?",
        options: ["tank", "support", "assassin", "Marksman"],
        answer: "tank",
      },
      {
        question: "Which role does Miya play?",
        options: ["mage", "fighter", "marksman", "roamer"],
        answer: "mage",
      },
    ],
  });
  assert.match(assembled.questions[0].answer.toLowerCase(), /marksman/);
  assert.equal(assembled.questions[0].options.includes(assembled.questions[0].answer), true);
  assert.equal(findExactOption(assembled.questions[0].options, assembled.questions[0].answer), assembled.questions[0].answer);
  assert.equal(/tank|mage|support|assassin/i.test(assembled.questions[0].answer), false);
  assert.equal(assembled.questions[1].options.includes(assembled.questions[1].answer), true);
  assert.equal(findExactOption(assembled.questions[1].options, assembled.questions[1].answer), assembled.questions[1].answer);
  assert.notEqual(assembled.questions[1].answer.toLowerCase(), "mage");
  assert.notEqual(assembled.questions[0].answer.toLowerCase(), assembled.questions[1].answer.toLowerCase());
});

test("meta translation labels are rejected as MCQ choices", () => {
  assert.equal(isMetaChoice("Tagalog word for bird", "If you want to say bird in Tagalog, which term do you select?"), true);
  assert.equal(isMetaChoice("the correct term"), true);
  assert.equal(isMetaChoice("translation of bird"), true);
  assert.equal(isMetaChoice("ibon", "If you want to say bird in Tagalog, which term do you select?"), false);
});

test("tutor MCQ keeps the real Tagalog term and drops the meta label", () => {
  const card = {
    id: "bird-tl",
    front: "What is the Tagalog word for bird?",
    back: "Ibon is the Tagalog word for bird.",
    answerHighlight: "ibon",
  };
  const question = sanitizeTutorQuestion(
    {
      question: "If you want to say bird in Tagalog, which term do you select?",
      options: ["aso", "ibon", "pusa", "Tagalog word for bird"],
      answer: "Tagalog word for bird",
    },
    card,
    ["aso", "pusa", "aso"]
  );
  assert.equal(question.answer.toLowerCase(), "ibon");
  assert.ok(question.options.some((item) => item.toLowerCase() === "ibon"));
  assert.equal(
    question.options.some((item) => /word for|translation of|correct term|tagalog word/i.test(item)),
    false
  );
  assert.equal(tutorQuestionIsSound(question, card, { preferredAnswer: "ibon" }), true);
  assert.equal(viableAnswerOptions(question.question, question.options, card).length, 1);

  const resolved = resolveTutorAnswerKey(
    question.question,
    ["aso", "ibon", "pusa", "Tagalog word for bird"],
    card,
    "Tagalog word for bird"
  );
  assert.equal(String(resolved).toLowerCase(), "ibon");

  const feedback = explainTutorChoice({
    card,
    question: question.question,
    correct: "ibon",
    selected: "aso",
    why: "Ibon means bird in Tagalog.",
  });
  assert.match(feedback.whyCorrect, /ibon/i);
  assert.equal(feedback.correctAnswer.toLowerCase(), "ibon");
  assert.match(String(feedback.whySelected || ""), /aso/i);
  assert.match(String(feedback.body || ""), /ibon/i);
});

test("tutorQuestionIsSound fails when two options look correct", () => {
  const card = {
    front: "What is the Tagalog word for bird?",
    back: "Ibon means bird. Also called the Tagalog word for bird.",
    answerHighlight: "ibon",
  };
  const bad = {
    question: "If you want to say bird in Tagalog, which term do you select?",
    options: ["aso", "ibon", "pusa", "Tagalog word for bird"],
    answer: "Tagalog word for bird",
  };
  // Raw AI bundle with a meta key must not pass the soundness gate.
  assert.equal(tutorQuestionIsSound(bad, card, { preferredAnswer: "ibon" }), false);
});
