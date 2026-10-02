// ─────────────────────────────────────────────────────────────────────────
// Internal error monitoring — CLIENT error sanitizer (PURE, server-only).
//
// Turns a minimal, browser-reported error payload (received by the
// /api/internal/client-error route) into the same bounded, PII-free AppErrorRow
// the DB sink writes — with surface = "client". Reuses the server scrub /
// normalize / fingerprint primitives so client + server errors share one model.
//
// HARD RULES (same as the server path):
//   - No customer data, request bodies, or secrets ever reach a row. Messages
//     and stacks are scrubbed + truncated; only name/message/stack/path/kind
//     are accepted, and the page path is reduced to a route shape (ids → :id).
//   - Fingerprints must be STABLE across deploys: browser stack frames carry
//     hashed chunk filenames + line:col that change every build, so the frame
//     used for grouping strips the origin, the content hash, and line:col.
// ─────────────────────────────────────────────────────────────────────────

import {
  buildFingerprint,
  normalizeMessage,
  sanitizeRoutePath,
  scrubText,
  truncate,
  type AppErrorRow,
} from "./fingerprint";
import { getBuildIdentity } from "@/lib/health-checks";

const MAX_MESSAGE = 500;
const MAX_STACK = 4096;
const MAX_TITLE = 200;
const MAX_NORMALISED = 200;
const MAX_NAME = 100;
const MAX_FRAME = 300;

const ALLOWED_KINDS = new Set(["error", "unhandledrejection", "boundary"]);

// Browser-extension / in-page-rewriter URLs. A stack (or a top frame) made of
// only these isn't an app bug — it's an extension's own script, or Safari's
// content-blocker masking a URL it redacted. Kept in sync with the same
// pattern in GlobalErrorListeners.tsx (client-side; checks `event.filename`
// before a report is even sent).
const EXTENSION_URL_PATTERN =
  /^(chrome|moz|safari(-web)?|ms-browser)-extension:|^webkit-masked-url:/i;

/**
 * The literal first stack-frame line, Chrome ("at fn (url)") or
 * Firefox/Safari ("fn@url") — deliberately NOT `extractClientTopFrame`,
 * which prefers the first frame WITH an https:// URL for fingerprinting
 * (skipping past a leading extension frame to the real code underneath). An
 * extension wrapping/monkey-patching a page function throws from ITS OWN
 * top frame with our https:// code one frame further down, so checking the
 * true first frame is the only way to catch that case.
 */
function firstFrameLine(stack: string): string | null {
  const lines = stack.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.find((l) => l.startsWith("at ") || /^[^\s@]+@/.test(l)) ?? null;
}

/** The scheme://… URL embedded in a stack-frame line ("at fn (url)" / "fn@url"), if any. */
function frameUrl(frameLine: string): string | null {
  return frameLine.match(/\b[a-z][a-z0-9+.-]*:\/\/[^\s)]+/i)?.[0] ?? null;
}

/** Raw shape the browser sends. Everything is optional / untrusted. */
export interface ClientErrorReport {
  name?: unknown;
  message?: unknown;
  stack?: unknown;
  kind?: unknown;
  /** location.pathname only — never a full URL with query/hash. */
  path?: unknown;
  /** Page-rewrite signals for classifying a #418 — see clientReport.ts. */
  flags?: unknown;
}

const FLAG_KEYS = ["translated", "langChanged", "appleDataDetectors", "grammarly"] as const;

/** Keeps only the known boolean flags; drops anything else (untrusted input). */
function sanitizeFlags(raw: unknown): Record<string, boolean> | null {
  if (!raw || typeof raw !== "object") return null;
  const out: Record<string, boolean> = {};
  let any = false;
  for (const key of FLAG_KEYS) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "boolean") {
      out[key] = v;
      any = true;
    }
  }
  return any ? out : null;
}

function toEnvironment(v: string | null): AppErrorRow["environment"] {
  if (v === "production" || v === "preview" || v === "development") return v;
  // Self-hosted (no VERCEL_ENV): label by NODE_ENV. Everything used to be
  // tagged "development", so the production-only error digest never fired.
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

/** Drop the content hash that Next adds to chunk filenames, plus long hex ids. */
function collapseHashes(path: string): string {
  return path
    .replace(/-[0-9a-f]{6,}(?=\.[a-z0-9]+$)/i, "") // page-9f3a2b.js → page.js
    .replace(/\.[0-9a-f]{8,}(?=\.[a-z0-9]+$)/i, "") // page.9f3a2b1c.js → page.js
    .replace(/\b[0-9a-f]{16,}\b/gi, "<hash>"); // any long hex segment
}

/** Split a stack-frame URL into pathname (+optional :line:col) without origin. */
function splitFrameUrl(rawUrl: string): { withPos: string; noPos: string } {
  const u = rawUrl.replace(/[)\]]+$/, ""); // trailing ) from "(url)"
  const posMatch = u.match(/(:\d+(?::\d+)?)$/); // trailing :line or :line:col
  const pos = posMatch ? posMatch[1] : "";
  let base = pos ? u.slice(0, -pos.length) : u;
  base = base.replace(/[?#].*$/, ""); // drop query / hash
  const path = base.replace(/^[a-z]+:\/\/[^/]+/i, ""); // drop scheme + host
  const clean = path || base;
  return { withPos: clean + pos, noPos: clean };
}

/**
 * Extract a representative top frame from a BROWSER stack. Returns:
 *   display — function + project-relative path WITH line:col (for debugging).
 *   stable  — same, hash-collapsed and WITHOUT line:col (for a stable group).
 * Handles Chrome ("at fn (url:li:co)") and Firefox/Safari ("fn@url:li:co").
 */
export function extractClientTopFrame(stack: string | null | undefined): {
  display: string | null;
  stable: string | null;
} {
  if (!stack || typeof stack !== "string") return { display: null, stable: null };
  const lines = stack
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const frame =
    lines.find((l) => /https?:\/\//.test(l) && (l.startsWith("at ") || l.includes("@"))) ??
    lines.find((l) => l.startsWith("at ")) ??
    null;
  if (!frame) return { display: null, stable: null };

  const urlMatch = frame.match(/https?:\/\/[^\s)]+/);
  if (!urlMatch) {
    const bare = truncate(frame.replace(/^at\s+/, ""), MAX_FRAME);
    return { display: bare, stable: collapseHashes(bare) };
  }

  let fn = "";
  const chrome = frame.match(/^at\s+([^(]+?)\s*\(/);
  const firefox = frame.match(/^([^@\s]+)@/);
  if (chrome) fn = chrome[1].trim();
  else if (firefox) fn = firefox[1].trim();
  fn = fn.replace(/^async\s+/, "").trim();

  const { withPos, noPos } = splitFrameUrl(urlMatch[0]);
  const prefix = fn ? `${fn} ` : "";
  const display = truncate(`${prefix}${withPos}`, MAX_FRAME);
  const stable = truncate(`${prefix}${collapseHashes(noPos)}`, MAX_FRAME);
  return { display, stable };
}


/**
 * Build the bounded, PII-free AppErrorRow for one client error report. Returns
 * null if the payload carries nothing useful (so the endpoint can no-op).
 * Pure aside from reading the server build identity (env + commit).
 */
export function sanitizeClientReport(raw: unknown): AppErrorRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as ClientErrorReport;

  const rawMessage = typeof r.message === "string" ? r.message : "";
  const rawStack = typeof r.stack === "string" ? r.stack : null;
  if (!rawMessage && !rawStack) return null; // nothing actionable
  const frames = extractClientTopFrame(rawStack);
  if (rawStack) {
    // Errors thrown by browser extensions (every frame is chrome-extension://,
    // moz-extension://, safari-web-extension://…) are not app errors.
    const frameUrls = rawStack.match(/\b[a-z][a-z0-9+.-]*:\/\/[^\s)]+/gi) ?? [];
    if (frameUrls.length > 0 && frameUrls.every((u) => !/^https?:\/\//i.test(u))) return null;
    // Narrower but just as real: the TOP frame is an extension (or a Safari
    // content-blocker's masked URL) even though a deeper frame is our own
    // https:// code — e.g. an extension wrapping/monkey-patching a page
    // function, which then throws from inside the extension's own call.
    const firstFrame = firstFrameLine(rawStack);
    const firstFrameUrl = firstFrame ? frameUrl(firstFrame) : null;
    if (firstFrameUrl && EXTENSION_URL_PATTERN.test(firstFrameUrl)) return null;
  }

  const name =
    typeof r.name === "string" && r.name ? truncate(r.name, MAX_NAME) : "Error";
  const normalizedMessage = normalizeMessage(rawMessage).slice(0, MAX_NORMALISED);
  const route = typeof r.path === "string" ? sanitizeRoutePath(r.path) : null;
  const kind =
    typeof r.kind === "string" && ALLOWED_KINDS.has(r.kind) ? r.kind : null;
  const flags = sanitizeFlags(r.flags);
  const build = getBuildIdentity();

  return {
    fingerprint: buildFingerprint({
      surface: "client",
      route,
      name,
      normalizedMessage,
      stableFrame: frames.stable,
    }),
    title: truncate(
      `${name}: ${normalizedMessage || rawMessage || "(no message)"}`,
      MAX_TITLE,
    ),
    surface: "client",
    route,
    environment: toEnvironment(build.vercelEnv),
    release_sha: build.commitSha ?? null,
    top_stack_frame: frames.display,
    name,
    message: rawMessage ? truncate(scrubText(rawMessage), MAX_MESSAGE) : null,
    stack: rawStack ? truncate(scrubText(rawStack), MAX_STACK) : null,
    http_status: null,
    request_id: null,
    extra: kind || flags ? { ...(kind ? { kind } : {}), ...(flags ?? {}) } : null,
  };
}
