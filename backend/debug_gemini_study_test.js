require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function runPrompt(prompt) {
  try {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await client.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
      contents: prompt,
      config: { temperature: 0.4, maxOutputTokens: 800 },
    });
    console.log('\n=== PROMPT ===\n', prompt);
    console.log('response keys:', Object.keys(response || {}));
    console.log('text:', response?.text || 'NO_TEXT');
    console.log('candidates length:', Array.isArray(response?.candidates) ? response.candidates.length : 'N/A');
    if (response?.candidates) {
      console.log('first candidate text:', response.candidates[0]?.content?.parts?.[0]?.text?.slice(0,400));
    }
  } catch (err) {
    console.error('\n=== PROMPT ERROR ===\n', prompt);
    console.error('ERR_NAME', err && err.name);
    console.error('ERR_STATUS', err && err.status);
    console.error('ERR_MESSAGE', err && err.message);
    console.error('ERR_BODY', err && err.body);
    console.error(err && err.stack);
  }
}

(async () => {
  await runPrompt('Hi');
  await runPrompt('I want to study photosynthesis and cellular respiration. Provide a study pack with key concepts and practice questions.');
})();
