require('dotenv').config();
const { generateStudyPack } = require('./src/lib/ai');

(async () => {
  try {
    const pack = await generateStudyPack('Photosynthesis and cellular respiration', '');
    console.log('PACK KEYS:', Object.keys(pack || {}));
    console.log('SUMMARY:', pack.summary && pack.summary.slice(0,400));
  } catch (err) {
    console.error('ERROR', err && err.message);
    console.error(err && err.stack);
  }
})();
