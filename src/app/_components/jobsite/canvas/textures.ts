import { CanvasTexture, Matrix4, SRGBColorSpace, Vector3 } from "three";
import type { Member } from "./frame";

/**
 * Everything the dawn site draws for itself: timber grain, the slab, the
 * phone's screens, and the matrix that turns a frame member into a box.
 * Canvas-drawn at load time, so there are no image downloads. Client only.
 */

/** A repeatable random sequence, so the timber looks the same on every visit. */
export function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function woodTexture(width: number): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = Math.max(32, width / 8);
  const g = c.getContext("2d");
  const rand = seeded(7);
  if (g) {
    g.fillStyle = "#c9a676";
    g.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 70; i++) {
      const y = rand() * c.height;
      const a = 0.05 + rand() * 0.12;
      g.strokeStyle = rand() > 0.5 ? `rgba(120,80,40,${a})` : `rgba(255,235,200,${a})`;
      g.lineWidth = 0.6 + rand() * 1.8;
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= c.width; x += 32) g.lineTo(x, y + Math.sin(x / 60 + i) * 1.5);
      g.stroke();
    }
    for (let k = 0; k < 5; k++) {
      g.fillStyle = "rgba(110,70,35,0.35)";
      g.beginPath();
      g.ellipse(rand() * c.width, 6 + rand() * (c.height - 12), 5 + rand() * 6, 2 + rand() * 2, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Power-floated slab with 3 m saw-cut joints. */
export function slabTexture(width: number): CanvasTexture {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = width;
  const g = c.getContext("2d");
  const rand = seeded(3);
  if (g) {
    g.fillStyle = "#8b8882";
    g.fillRect(0, 0, width, width);
    for (let i = 0; i < width * 9; i++) {
      const v = 110 + Math.floor(rand() * 60);
      g.fillStyle = `rgba(${v},${v},${v - 4},0.25)`;
      g.fillRect(rand() * width, rand() * width, 1.5, 1.5);
    }
    g.strokeStyle = "rgba(40,38,35,0.55)";
    g.lineWidth = Math.max(1, width / 512);
    for (let k = 1; k < 3; k++) {
      g.beginPath();
      g.moveTo((k * width) / 3, 0);
      g.lineTo((k * width) / 3, width);
      g.stroke();
      g.beginPath();
      g.moveTo(0, (k * width) / 3);
      g.lineTo(width, (k * width) / 3);
      g.stroke();
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

const X = new Vector3();
const Y = new Vector3();
const Z = new Vector3();
const UP = new Vector3(0, 1, 0);
const A = new Vector3();
const B = new Vector3();
const S = new Vector3();

/**
 * A unit box → this member: its length along the run, `h` in the member's
 * up direction and `w` across. Rafters and plates stay square to the
 * ground (no roll); vertical members keep their 90 face towards z.
 */
export function memberMatrix(mem: Member, out: Matrix4): Matrix4 {
  A.fromArray(mem.a);
  B.fromArray(mem.b);
  X.subVectors(B, A);
  const len = X.length() || 1;
  X.divideScalar(len);
  Z.crossVectors(X, UP);
  if (Z.lengthSq() < 1e-8) Z.set(0, 0, 1);
  else Z.normalize();
  Y.crossVectors(Z, X).normalize();
  out.makeBasis(X, Y, Z);
  out.scale(S.set(len, mem.h, mem.w));
  out.setPosition(A.add(B).multiplyScalar(0.5));
  return out;
}

// ── The phone's screens ────────────────────────────────────────────────

export type ScreenFonts = { display: string; mono: string; sans: string };

export function readScreenFonts(): ScreenFonts {
  const css = getComputedStyle(document.documentElement);
  const pick = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback;
  return {
    display: pick("--font-display", "sans-serif"),
    mono: pick("--font-mono", "monospace"),
    sans: pick("--font-sans", "sans-serif"),
  };
}

/** Before it wakes: the lock screen at first light. */
export function drawLockScreen(ctx: CanvasRenderingContext2D, w: number, h: number, fonts: ScreenFonts) {
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#161b2b");
  sky.addColorStop(1, "#3a2c2c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "rgba(242,239,234,0.92)";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.font = `${Math.round(h * 0.11)}px ${fonts.display}`;
  ctx.fillText("6:42", w / 2, h * 0.27);
  ctx.font = `500 ${Math.round(h * 0.026)}px ${fonts.mono}`;
  ctx.fillStyle = "rgba(242,239,234,0.6)";
  ctx.fillText("TUESDAY", w / 2, h * 0.32);
  ctx.textAlign = "start";
}

const TRANSCRIPT =
  "New deck out the back, six by four, kwila boards on H3.2 joists at 450 centres, two steps down to the lawn.";

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number) {
  let line = "";
  let yy = y;
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

/** Awake: someone is talking the job through (example job). */
export function drawTalkScreen(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, fonts: ScreenFonts) {
  ctx.fillStyle = "#0b0b0c";
  ctx.fillRect(0, 0, w, h);
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(242,239,234,0.55)";
  ctx.font = `500 ${Math.round(h * 0.022)}px ${fonts.mono}`;
  ctx.fillText("TRADIES2QUOTE", w * 0.08, h * 0.06);
  ctx.fillStyle = "#f2efea";
  ctx.font = `${Math.round(h * 0.05)}px ${fonts.display}`;
  ctx.fillText("TALK THE", w * 0.08, h * 0.1);
  ctx.fillText("JOB THROUGH", w * 0.08, h * 0.155);
  if (Math.sin(time * 4) > -0.3) {
    ctx.fillStyle = "#ff5f15";
    ctx.beginPath();
    ctx.arc(w * 0.1, h * 0.244, h * 0.011, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#ff5f15";
  ctx.font = `500 ${Math.round(h * 0.024)}px ${fonts.mono}`;
  ctx.fillText(`REC 0:${String(Math.floor(time) % 60).padStart(2, "0")}`, w * 0.15, h * 0.232);

  const bars = 26;
  const gap = (w * 0.84) / bars;
  const mid = h * 0.43;
  for (let i = 0; i < bars; i++) {
    const a = Math.abs(Math.sin(time * 3.1 + i * 0.62) * Math.sin(time * 1.7 + i * 0.27));
    const envelope = 0.35 + 0.65 * Math.sin((i / (bars - 1)) * Math.PI);
    const bh = Math.max(h * 0.008, a * envelope * h * 0.16);
    ctx.fillStyle = i % 6 === 2 ? "#ff5f15" : "#f2efea";
    ctx.fillRect(w * 0.08 + i * gap, mid - bh / 2, gap * 0.55, bh);
  }

  const words = TRANSCRIPT.split(" ");
  const shown = Math.min(words.length, Math.floor((time * 2.6) % (words.length + 8)));
  ctx.fillStyle = "#cfc8bd";
  ctx.font = `400 ${Math.round(h * 0.03)}px ${fonts.sans}`;
  wrapText(ctx, words.slice(0, shown).join(" "), w * 0.08, h * 0.57, w * 0.84, h * 0.042);

  ctx.fillStyle = "#ff5f15";
  ctx.fillRect(w * 0.08, h * 0.86, w * 0.84, h * 0.07);
  ctx.fillStyle = "#0a0a0a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(h * 0.028)}px ${fonts.sans}`;
  ctx.fillText("Write my quote", w / 2, h * 0.895);
  ctx.textAlign = "start";
  ctx.textBaseline = "alphabetic";
}
