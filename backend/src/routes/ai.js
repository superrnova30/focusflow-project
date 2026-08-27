const express = require("express");
const { generateStudyPack, generateStudyNotes, generateFlashcards, generateQuiz } = require("../lib/ai");
const router = express.Router();
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

// POST /api/ai/study
// body: { topic, notes, mode }
router.post("/study", async (req, res) => {
  const { topic, notes, mode } = req.body || {};
  try {
    if (mode === "notes") {
      const notesPack = await generateStudyNotes(topic || "", notes || "");
      return res.json({ pack: notesPack });
    }

    if (mode === "flashcards") {
      const cards = await generateFlashcards(topic || "", notes || "");
      return res.json({ pack: { flashcards: cards.flashcards || cards } });
    }

    if (mode === "quiz") {
      const quiz = await generateQuiz(topic || "", notes || "");
      return res.json({ pack: quiz });
    }

    // default: study pack
    const pack = await generateStudyPack(topic || "", notes || "");
    res.json({ pack });
  } catch (err) {
    console.error("AI /study error:", err);
    res.status(502).json({ error: "AI generation failed. Try again later." });
  }
});

module.exports = router;
