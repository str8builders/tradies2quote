#!/usr/bin/env node
/**
 * Makes the homepage demo's voiceover from src/remotion/demo-voiceover.ts.
 *
 *   node scripts/make-demo-voiceover.mjs            speak, measure, stitch, write
 *   node scripts/make-demo-voiceover.mjs --check    exit 1 if the timing file is stale
 *
 * Every line is spoken by the private voice service on the Sydney server
 * (stowe-tts, 127.0.0.1:3910, reached over `ssh str8-sydney`): Kokoro-82M,
 * Apache-2.0, so the audio may be used commercially. Never point this at
 * VoiceStudio's default engine (OmniVoice, non-commercial weights).
 *
 * Writes:
 *   src/remotion/demo-voiceover-timing.ts         each chapter's length and each line's start/end
 *   src/remotion/marketing/media/demo-voiceover.m4a   the whole narration, silence included
 * Spoken clips are cached in marketing-media/voiceover/ (git-ignored), keyed
 * by voice + text, so re-running after a small edit only speaks what changed.
 *
 * Then render the videos with it:
 *   npm run render:marketing -- --only=demo-wide,demo-tall
 * (the demo targets pick the voiceover up by themselves).
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(ROOT, "package.json"));
const { RenderInternals } = require("@remotion/renderer");
const { NARRATION, VOICE, VOICE_PACING, MIN_CHAPTER_SECONDS } = await import(path.join(ROOT, "src/remotion/demo-voiceover.ts"));

const FPS = 30;
const RATE = 24000;
const CACHE = path.join(ROOT, "marketing-media/voiceover");
const TIMING_FILE = path.join(ROOT, "src/remotion/demo-voiceover-timing.ts");
const AUDIO_FILE = path.join(ROOT, "src/remotion/marketing/media/demo-voiceover.m4a");
const log = (...a) => console.log("[voiceover]", ...a);

/** Changes whenever anything that affects the audio changes. */
export function scriptHash() {
  const h = createHash("sha256");
  h.update(JSON.stringify({ VOICE, VOICE_PACING, MIN_CHAPTER_SECONDS, say: NARRATION.map((c) => [c.id, c.lines.map((l) => l.say)]) }));
  return h.digest("hex").slice(0, 16);
}

if (process.argv.includes("--check")) {
  const current = fs.existsSync(TIMING_FILE) ? fs.readFileSync(TIMING_FILE, "utf8") : "";
  const ok = current.includes(`"${scriptHash()}"`);
  console.log(ok ? "voiceover timing is up to date" : "voiceover timing is STALE: run node scripts/make-demo-voiceover.mjs");
  process.exit(ok ? 0 : 1);
}

async function ff(args) {
  await RenderInternals.callFf({
    bin: "ffmpeg",
    args: ["-hide_banner", "-loglevel", "error", ...args],
    indent: false,
    logLevel: "error",
    binariesDirectory: null,
    cancelSignal: undefined,
  });
}

function speak(text) {
  const body = JSON.stringify({ model: VOICE.engine, voice: VOICE.voice, speed: VOICE.speed, priority: "ahead", input: text });
  // The service only listens on the server's loopback; the body goes over stdin.
  return execFileSync(
    "ssh",
    ["-o", "ConnectTimeout=20", "str8-sydney", "curl -sf --max-time 300 -X POST http://127.0.0.1:3910/v1/audio/speech -H 'Content-Type: application/json' --data-binary @-"],
    { input: body, maxBuffer: 64 * 1024 * 1024 },
  );
}

/** One line as 24 kHz mono 16-bit PCM, spoken once and cached. */
async function lineAudio(text) {
  const key = createHash("sha256").update(`${VOICE.engine}|${VOICE.voice}|${VOICE.speed}|${text}`).digest("hex").slice(0, 20);
  const wav = path.join(CACHE, `${key}.wav`);
  if (!fs.existsSync(wav)) {
    const mp3 = path.join(CACHE, `${key}.mp3`);
    log(`speaking: ${text}`);
    const audio = speak(text);
    if (audio.length < 1000) throw new Error(`the voice service returned ${audio.length} bytes for: ${text}`);
    fs.writeFileSync(mp3, audio);
    await ff(["-y", "-i", mp3, "-ac", "1", "-ar", String(RATE), "-c:a", "pcm_s16le", wav]);
  }
  return wavSamples(fs.readFileSync(wav));
}

/** The PCM inside a WAV file (its "data" chunk). */
function wavSamples(file) {
  let at = 12;
  while (at + 8 <= file.length) {
    const id = file.toString("latin1", at, at + 4);
    const size = file.readUInt32LE(at + 4);
    if (id === "data") return file.subarray(at + 8, at + 8 + size);
    at += 8 + size + (size % 2);
  }
  throw new Error("no data chunk in WAV");
}

/** 16-bit mono PCM wrapped as a WAV file. */
function toWav(pcm) {
  const head = Buffer.alloc(44);
  head.write("RIFF", 0, "latin1");
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write("WAVEfmt ", 8, "latin1");
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(RATE, 24);
  head.writeUInt32LE(RATE * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36, "latin1");
  head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}

const seconds = (pcm) => pcm.length / 2 / RATE;
const silence = (s) => Buffer.alloc(Math.round(s * RATE) * 2);
const round3 = (n) => Math.round(n * 1000) / 1000;

fs.mkdirSync(CACHE, { recursive: true });
const parts = [];
const chapters = [];
for (const chapter of NARRATION) {
  const clips = [];
  for (const line of chapter.lines) clips.push(await lineAudio(line.say));
  const { leadIn, gap, tail } = VOICE_PACING;
  const lines = [];
  let t = leadIn;
  for (const clip of clips) {
    lines.push([round3(t), round3(t + seconds(clip))]);
    t += seconds(clip) + gap;
  }
  const spoken = t - gap + tail;
  // Whole frames, so the audio and the timeline agree to the frame.
  const length = Math.ceil(Math.max(MIN_CHAPTER_SECONDS[chapter.id], spoken) * FPS) / FPS;
  const track = [silence(leadIn)];
  clips.forEach((clip, i) => {
    track.push(clip);
    if (i < clips.length - 1) track.push(silence(gap));
  });
  const used = track.reduce((n, b) => n + b.length, 0);
  track.push(Buffer.alloc(Math.max(0, Math.round(length * RATE) * 2 - used)));
  parts.push(...track);
  chapters.push({ id: chapter.id, seconds: round3(length), lines });
  log(`${chapter.id}: ${length.toFixed(2)} s, ${clips.length} lines`);
}

const total = chapters.reduce((n, c) => n + c.seconds, 0);
const whole = path.join(CACHE, "demo-voiceover.wav");
fs.writeFileSync(whole, toWav(Buffer.concat(parts)));
fs.mkdirSync(path.dirname(AUDIO_FILE), { recursive: true });
// Loudness-normalised for speech on the web, then AAC.
await ff(["-y", "-i", whole, "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-c:a", "aac", "-b:a", "128k", "-f", "mp4", AUDIO_FILE]);

fs.writeFileSync(
  TIMING_FILE,
  `/**
 * GENERATED by scripts/make-demo-voiceover.mjs from ./demo-voiceover.ts. Do not edit.
 * Each chapter's length and each line's [start, end] in seconds from the
 * chapter's start, measured from the spoken audio (${VOICE.engine} ${VOICE.voice}).
 */
export const VOICEOVER_TIMING = {
  scriptHash: "${scriptHash()}",
  totalSeconds: ${round3(total)},
  chapters: ${JSON.stringify(chapters, null, 2).replace(/\n/g, "\n  ")},
} as const;
`,
);
log(`total ${total.toFixed(2)} s`);
log(`wrote ${path.relative(ROOT, TIMING_FILE)} and ${path.relative(ROOT, AUDIO_FILE)} (${(fs.statSync(AUDIO_FILE).size / 1024).toFixed(0)} KB)`);
