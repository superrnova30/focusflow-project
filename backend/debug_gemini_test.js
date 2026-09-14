require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

(async () => {
  try {
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await client.models.generateContent({
      model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
      contents: 'Hi',
      config: { temperature: 0.4, maxOutputTokens: 800 },
    });

    console.log('response keys:', Object.keys(response || {}));
    console.log('text type:', typeof response?.text);
    console.log('text:', response?.text || 'NO_TEXT');
    console.log('candidates length:', Array.isArray(response?.candidates) ? response.candidates.length : 'N/A');
    if (response?.candidates) {
      console.log('first candidate:', JSON.stringify(response.candidates[0], null, 2).slice(0, 1200));
    }
  } catch (err) {
    console.error('ERR_NAME', err && err.name);
    console.error('ERR_STATUS', err && err.status);
    console.error('ERR_MESSAGE', err && err.message);
    console.error('ERR_BODY', err && err.body);
    console.error(err);
    process.exit(1);
  }
})();
