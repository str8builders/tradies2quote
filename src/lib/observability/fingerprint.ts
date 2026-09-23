// ─────────────────────────────────────────────────────────────────────────
// Internal error monitoring — fingerprint + scrub + row-builder (PURE, server).
//
// Turns a caught error + context into the bounded, PII-free row the DB sink
// writes. Everything here is deterministic and unit-testable. No IO, no DB.
// Server-only (uses node:crypto + reads build identity); never imported by a
// client component.
//
// HARD RULES:
//   - No customer data, request bodies, or secrets ever reach a row. Messages
//     and stacks are scrubbed (emails / token-shaped strings redacted) and
//     truncated. `extra` is only kept if it's small and caller-supplied.
//   - Fingerprints must be STABLE across deploys: line:col are stripped from
//     the frame used for grouping, and volatile message tokens are normalised.
// ─────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { getBuildIdentity } from "@/lib/health-checks";

export type ErrorSurface = "api" | "client" | "server_action";

export interface CaptureContext {
  route?: string;
  surface?: ErrorSurface;
  httpStatus?: number;
  requestId?: string;
  /** Small, caller-supplied, NON-PII context. Dropped if too large. */
  extra?: Record<string, unknown>;
}

export interface AppErrorRow {
  fingerprint: string;
  title: string;
  surface: ErrorSurface;
  route: string | null;
  environment: "production" | "preview" | "development";
  release_sha: string | null;
  top_stack_frame: string | null;
  name: string | null;
  message: string | null;
  stack: string | null;
  http_status: number | null;
  request_id: string | null;
  extra: Record<string, unknown> | null;
}

const MAX_MESSAGE = 500;
const MAX_STACK = 4096;
const MAX_EXTRA_CHARS = 2048;
const MAX_TITLE = 200;
const MAX_NORMALISED = 200;

/** Redact obvious PII / secret-shaped tokens from free text. */
export function scrubText(input: string): string {
  return input
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, "<email>")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/g, "Bearer <redacted>")
    .replace(/\b(?:sk|pk|rk|whsec|re|key|AKIA)[-_][A-Za-z0-9_-]{8,}/gi, "<redacted>")
    .replace(/eyJ[A-Za-z0-9._-]{10,}/g, "<jwt>");
}

/** Truncate with an ellipsis marker; never throws. */
export function truncate(input: string, max: number): string {
  return input.length <= max ? input : input.slice(0, max) + "…";
}

const MAX_ROUTE_PATH = 200;

/**
 * Reduce a page pathname to a route shape: numeric / uuid / hash ids → :id,
 * opaque public tokens (e.g. /quote/<token>) → :token, so a live client link
 * is never stored in the error log. Shared with the server-side capture path.
 */
export function sanitizeRoutePath(p: string): string | null {
  if (typeof p !== "string" || !p) return null;
  const cleaned = scrubText(p).replace(/[?#].*$/, "");
  const shaped = cleaned
    .split("/")
    .map((seg) => {
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg))
        return ":id";
      if (/^\d+$/.test(seg)) return ":id";
      if (/^[0-9a-f]{16,}$/i.test(seg)) return ":id";
      // Mixed-case base64url tokens (public quote links, request slugs).
      if (/^[A-Za-z0-9_-]{16,}$/.test(seg) && /\d/.test(seg) && /[A-Za-z]/.test(seg)) return ":token";
      return seg;
    })
    .join("/");
  return truncate(shaped, MAX_ROUTE_PATH);
}

/** Collapse volatile tokens so the same bug groups regardless of values. */
export function normalizeMessage(message: string): string {
  return scrubText(message)
    .replace(/https?:\/\/[^\s)]+/gi, "<url>")
    .replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "<id>",
    )
    .replace(/\b[0-9a-f]{12,}\b/gi, "<hex>")
    .replace(/["'][^"']*["']/g, "<str>")
    .replace(/\b\d+\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_NORMALISED);
}

/**
 * Pull a top stack frame. Returns:
 *   display — first meaningful frame, project-relative, WITH line:col (debug).
 *   stable  — same frame WITHOUT line:col, for a deploy-stable fingerprint.
 */
export function extractTopFrame(stack: string | undefined | null): {
  display: string | null;
  stable: string | null;
} {
  if (!stack) return { display: null, stable: null };
  const lines = stack.split("\n").map((l) => l.trim());
  const frame =
    lines.find(
      (l) =>
        l.startsWith("at ") &&
        /(\/src\/|\/app\/|webpack-internal|\.next\/server)/.test(l),
    ) ??
    lines.find((l) => l.startsWith("at ")) ??
    null;
  if (!frame) return { display: null, stable: null };
  // Keep from the first project-ish path segment; drop absolute prefixes.
  const m = frame.match(/((?:src|app|\.next)\/[^\s()]+)/);
  const display = (m ? m[1] : frame.replace(/^at\s+/, "")).slice(0, 300);
  const stable = display.replace(/:\d+:\d+$/, "").replace(/:\d+$/, "");
  return { display, stable };
}

export function buildFingerprint(parts: {
  surface: string;
  route: string | null;
  name: string;
  normalizedMessage: string;
  stableFrame: string | null;
}): string {
  const basis = [
    parts.surface,
    parts.route ?? "",
    parts.name,
    parts.normalizedMessage,
    parts.stableFrame ?? "",
  ].join("|");
  return createHash("sha256").update(basis).digest("hex");
}

function toEnvironment(v: string | null): AppErrorRow["environment"] {
  if (v === "production" || v === "preview" || v === "development") return v;
  // Self-hosted (no VERCEL_ENV): label by NODE_ENV. Everything used to be
  // tagged "development", so the production-only error digest never fired.
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

/**
 * Assemble the bounded, PII-free row for one caught error. Pure aside from
 * reading the build identity (env + commit) from process.env.
 */
export function buildErrorRow(
  error: unknown,
  ctx: CaptureContext = {},
): AppErrorRow {
  const err =
    error instanceof Error
      ? error
      : new Error(typeof error === "string" ? error : "Non-error thrown");
  const name = err.name || "Error";
  const rawMessage = err.message || "";
  const normalizedMessage = normalizeMessage(rawMessage);
  const frames = extractTopFrame(err.stack);
  const surface = ctx.surface ?? "api";
  // Same route shaping as client reports: never store a live token or id.
  const route = ctx.route ? sanitizeRoutePath(ctx.route) : null;
  const build = getBuildIdentity();

  let extra: Record<string, unknown> | null = null;
  if (ctx.extra) {
    try {
      const json = JSON.stringify(ctx.extra);
      extra =
        json.length <= MAX_EXTRA_CHARS
          ? ctx.extra
          : { _truncated: true, bytes: json.length };
    } catch {
      extra = { _note: "extra omitted (unserialisable)" };
    }
  }

  return {
    fingerprint: buildFingerprint({
      surface,
      route,
      name,
      normalizedMessage,
      stableFrame: frames.stable,
    }),
    title: truncate(
      `${name}: ${normalizedMessage || rawMessage || "(no message)"}`,
      MAX_TITLE,
    ),
    surface,
    route,
    environment: toEnvironment(build.vercelEnv),
    release_sha: build.commitSha ?? null,
    top_stack_frame: frames.display,
    name,
    message: rawMessage ? truncate(scrubText(rawMessage), MAX_MESSAGE) : null,
    stack: err.stack ? truncate(scrubText(err.stack), MAX_STACK) : null,
    http_status: ctx.httpStatus ?? null,
    request_id: ctx.requestId ?? null,
    extra,
  };
}
