/* eslint-disable no-console */
// Generates small WAV alarm tones into mobile/assets/alarms/.
// Pure Node — no dependencies. PCM 16-bit mono @ 22050 Hz.
const fs = require("fs");
const path = require("path");

const SAMPLE_RATE = 22050;
const OUT_DIR = path.join(__dirname, "..", "assets", "alarms");

fs.mkdirSync(OUT_DIR, { recursive: true });

function encodeWav(samples) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = SAMPLE_RATE * blockAlign;
  const dataSize = samples.length * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buffer;
}

// ---- Tone generators ----------------------------------------------------

// Classic digital beep: short square bursts.
function beep(ms = 2400) {
  const n = Math.floor((SAMPLE_RATE * ms) / 1000);
  const out = new Array(n).fill(0);
  const burstLen = SAMPLE_RATE * 0.18;
  const gapLen = SAMPLE_RATE * 0.1;
  let base = 0;
  while (base < n) {
    for (let i = 0; i < burstLen && base + i < n; i++) {
      const t = i / SAMPLE_RATE;
      const attack = Math.min(1, i / (SAMPLE_RATE * 0.01));
      const release = Math.min(1, (burstLen - i) / (SAMPLE_RATE * 0.03));
      out[base + i] = Math.sin(2 * Math.PI * 880 * t) * attack * release * 0.55;
    }
    base += burstLen + gapLen;
  }
  return out;
}

// Pleasant bell chime: decaying harmonics.
function chime(ms = 3200) {
  const n = Math.floor((SAMPLE_RATE * ms) / 1000);
  const out = new Array(n).fill(0);
  const f0 = 523.25; // C5
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const decay = Math.exp(-3.2 * t);
    const env = Math.min(1, i / (SAMPLE_RATE * 0.005));
    out[i] =
      (0.5 * Math.sin(2 * Math.PI * f0 * t) +
        0.25 * Math.sin(2 * Math.PI * f0 * 2 * t) +
        0.12 * Math.sin(2 * Math.PI * f0 * 3 * t)) *
      decay *
      env *
      0.5;
  }
  return out;
}

// Marimba: two soft woody tones struck in sequence.
function marimba(ms = 3000) {
  const n = Math.floor((SAMPLE_RATE * ms) / 1000);
  const out = new Array(n).fill(0);
  const note = (startS, freq, durS) => {
    const start = Math.floor(startS * SAMPLE_RATE);
    const len = Math.floor(durS * SAMPLE_RATE);
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / SAMPLE_RATE;
      const envelope = Math.exp(-6 * t) * Math.min(1, i / (SAMPLE_RATE * 0.004));
      out[start + i] +=
        (0.6 * Math.sin(2 * Math.PI * freq * t) + 0.2 * Math.sin(2 * Math.PI * freq * 3 * t)) * envelope * 0.45;
    }
  };
  note(0.0, 659.25, 0.8); // E5
  note(0.22, 783.99, 0.8); // G5
  note(0.44, 1046.5, 1.0); // C6
  return out;
}

// Digital: modern two-tone tech alarm with soft pulse.
function digital(ms = 2800) {
  const n = Math.floor((SAMPLE_RATE * ms) / 1000);
  const out = new Array(n).fill(0);
  const pulse = SAMPLE_RATE * 0.5;
  for (let i = 0; i < n; i++) {
    const inPulse = i % pulse;
    const t = i / SAMPLE_RATE;
    const f = inPulse < pulse / 2 ? 880 : 620;
    const attack = Math.min(1, inPulse / (SAMPLE_RATE * 0.005));
    const release = Math.min(1, (pulse - inPulse) / (SAMPLE_RATE * 0.01));
    out[i] = Math.sin(2 * Math.PI * f * t) * attack * release * 0.4;
  }
  return out;
}

const files = {
  "beep.wav": beep(),
  "chime.wav": chime(),
  "marimba.wav": marimba(),
  "digital.wav": digital(),
};

for (const [name, samples] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT_DIR, name), encodeWav(samples));
  console.log(`wrote ${name} (${samples.length} samples)`);
}
console.log("Done. Alarms in:", OUT_DIR);

