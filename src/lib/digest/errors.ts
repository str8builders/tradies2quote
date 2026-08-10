// ─────────────────────────────────────────────────────────────────────────
// Morning error digest — pure renderer + pure grouping.
//
// The support ticket that never gets filed: the app breaks on someone's
// phone, they swear at it, and nobody writes in. The internal monitor
// already catches those failures (server, browser, and the calculator
// app's crash reports all land in `app_error_events`); this turns the last
// day of them into one morning email — grouped, ranked by how many hit
// them, with an AI-drafted diagnosis for the top few.
//
// Everything in this file is pure and deterministic (no clock, no I/O) so
// it's trivially unit-testable. Data gathering and the Anthropic call live
// in errorsCollect.ts.
// ─────────────────────────────────────────────────────────────────────────

/** One error group, as it appears in the digest window. */
export type DigestGroup = {
  fingerprint: string;
  title: string;
  /** "api" | "client" | "server_action" — where it happened. */
  surface: string;
  route: string | null;
  /** Events inside the window. */
  windowCount: number;
  /** Lifetime events, for "this has been going on a while" context. */
  lifetimeCount: number;
  /** First ever seen inside this window → a brand-new problem. */
  isNew: boolean;
  /** Previously marked resolved, now back — the worst kind of news. */
  resurfaced: boolean;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
};

/** AI-drafted triage for one group. Advisory, never authoritative. */
export type Diagnosis = {
  fingerprint: string;
  likelyCause: string;
  severity: "high" | "medium" | "low";
  nextStep: string;
};

export interface ErrorDigestData {
  windowDays: number;
  totalEvents: number;
  groups: DigestGroup[];
  diagnoses: Diagnosis[];
}

export interface RenderedErrorDigest {
  subject: string;
  text: string;
  html: string;
}

// ── Pure grouping ─────────────────────────────────────────────────────────

/** The raw rows the collector reads; kept structural so tests need no DB. */
export type WindowEvent = {
  group_id: string | null;
  fingerprint: string;
  name: string | null;
  message: string | null;
  surface: string;
  route: string | null;
  occurred_at: string;
};

export type GroupRow = {
  id: string;
  fingerprint: string;
  title: string;
  surface: string;
  route: string | null;
  event_count: number;
  first_seen_at: string | null;
  last_seen_at: string | null;
  resolved_at: string | null;
};

/**
 * Fold a window of events onto their groups, most-hit first.
 *
 * Counting happens over the window's own events rather than trusting the
 * group's lifetime `event_count` — a group that exploded overnight and one
 * that has dribbled for a month can have the same lifetime count, and only
 * one of them is this morning's problem.
 */
export function summariseWindow(
  events: WindowEvent[],
  groups: GroupRow[],
  sinceIso: string,
): { totalEvents: number; groups: DigestGroup[] } {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const byFingerprint = new Map(groups.map((g) => [g.fingerprint, g]));

  const counts = new Map<string, { count: number; sample: WindowEvent }>();
  for (const ev of events) {
    const key = ev.group_id ?? ev.fingerprint;
    const entry = counts.get(key);
    if (entry) {
      entry.count += 1;
      // Keep the latest sample so titles reflect the current shape.
      if (ev.occurred_at > entry.sample.occurred_at) entry.sample = ev;
    } else {
      counts.set(key, { count: 1, sample: ev });
    }
  }

  const out: DigestGroup[] = [];
  for (const [key, { count, sample }] of counts) {
    const group = byId.get(key) ?? byFingerprint.get(sample.fingerprint);
    out.push({
      fingerprint: group?.fingerprint ?? sample.fingerprint,
      title:
        group?.title ??
        [sample.name, sample.message].filter(Boolean).join(": ").slice(0, 160) ??
        "Unknown error",
      surface: group?.surface ?? sample.surface,
      route: group?.route ?? sample.route,
      windowCount: count,
      lifetimeCount: Math.max(group?.event_count ?? count, count),
      isNew: group?.first_seen_at != null ? group.first_seen_at >= sinceIso : true,
      resurfaced:
        group?.resolved_at != null &&
        group.last_seen_at != null &&
        group.last_seen_at >= sinceIso,
      firstSeenAt: group?.first_seen_at ?? null,
      lastSeenAt: group?.last_seen_at ?? sample.occurred_at,
    });
  }

  out.sort(
    (a, b) => b.windowCount - a.windowCount || a.title.localeCompare(b.title),
  );
  return { totalEvents: events.length, groups: out };
}

// ── Diagnosis parsing ─────────────────────────────────────────────────────

/**
 * Read the model's reply — a JSON array, possibly wearing a code fence —
 * into diagnoses. Lenient on wrapping, strict on shape: an entry missing
 * its fields is dropped rather than rendered half-formed, and a reply that
 * parses to nothing yields an empty list, never a throw. The digest must
 * send with or without its AI garnish.
 */
export function parseDiagnoses(raw: string): Diagnosis[] {
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const start = stripped.indexOf("[");
  const end = stripped.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: Diagnosis[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as Record<string, unknown>;
    const fingerprint = typeof o.fingerprint === "string" ? o.fingerprint : "";
    const likelyCause = typeof o.likely_cause === "string" ? o.likely_cause : "";
    const nextStep = typeof o.next_step === "string" ? o.next_step : "";
    const severity =
      o.severity === "high" || o.severity === "medium" || o.severity === "low"
        ? o.severity
        : "medium";
    if (!fingerprint || !likelyCause || !nextStep) continue;
    out.push({ fingerprint, likelyCause, severity, nextStep });
  }
  return out;
}

// ── Rendering ─────────────────────────────────────────────────────────────

const SURFACE_WORDS: Record<string, string> = {
  api: "server",
  server_action: "server action",
  client: "app/browser",
};

function surfaceWord(surface: string): string {
  return SURFACE_WORDS[surface] ?? surface;
}

function badge(g: DigestGroup): string {
  if (g.resurfaced) return "RESURFACED";
  if (g.isNew) return "NEW";
  return "ongoing";
}

export function buildErrorDigest(d: ErrorDigestData): RenderedErrorDigest {
  const problems = d.groups.length;
  const windowWord = d.windowDays === 1 ? "the last 24h" : `the last ${d.windowDays} days`;
  const newCount = d.groups.filter((g) => g.isNew || g.resurfaced).length;

  const subject = `T2Q errors — ${d.totalEvents} event${d.totalEvents === 1 ? "" : "s"} across ${problems} problem${problems === 1 ? "" : "s"} in ${windowWord}${newCount > 0 ? ` (${newCount} new)` : ""}`;

  const diagnosisFor = new Map(d.diagnoses.map((x) => [x.fingerprint, x]));

  // ── plain text ──
  const lines: string[] = [];
  lines.push("WHAT BROKE, RANKED BY HOW MANY TIMES IT HIT");
  lines.push("");
  for (const g of d.groups.slice(0, 10)) {
    lines.push(
      `  • [${badge(g)}] ${g.title}`,
    );
    lines.push(
      `      ${surfaceWord(g.surface)}${g.route ? ` · ${g.route}` : ""} · ${g.windowCount} in window, ${g.lifetimeCount} lifetime`,
    );
    const diag = diagnosisFor.get(g.fingerprint);
    if (diag) {
      lines.push(`      likely cause (${diag.severity}): ${diag.likelyCause}`);
      lines.push(`      next step: ${diag.nextStep}`);
    }
    lines.push("");
  }
  if (d.groups.length > 10) {
    lines.push(`  …and ${d.groups.length - 10} more, in the monitor.`);
    lines.push("");
  }
  lines.push(
    "Diagnoses are AI drafts read off scrubbed error metadata — check the monitor before acting on one.",
  );

  // ── html ──
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const badgeHtml = (g: DigestGroup) => {
    const b = badge(g);
    const colour = b === "RESURFACED" ? "#C0261B" : b === "NEW" ? "#FF5F15" : "#777";
    return `<span style="font:600 10px system-ui;letter-spacing:.06em;color:${colour}">${b}</span>`;
  };
  const rows = d.groups
    .slice(0, 10)
    .map((g) => {
      const diag = diagnosisFor.get(g.fingerprint);
      return `<li style="margin:0 0 12px">${badgeHtml(g)} <strong>${esc(g.title)}</strong><br><span style="color:#555">${esc(surfaceWord(g.surface))}${g.route ? ` · ${esc(g.route)}` : ""} · ${g.windowCount} in window, ${g.lifetimeCount} lifetime</span>${
        diag
          ? `<br><span style="color:#222">likely cause <em>(${diag.severity})</em>: ${esc(diag.likelyCause)}</span><br><span style="color:#222">next step: ${esc(diag.nextStep)}</span>`
          : ""
      }</li>`;
    })
    .join("");

  const html = `<div style="max-width:640px;margin:0 auto;padding:8px 4px">
<h2 style="font:700 18px system-ui;color:#111;margin:0 0 4px">What broke overnight</h2>
<p style="font:13px system-ui;color:#555;margin:0 0 14px">${d.totalEvents} event${d.totalEvents === 1 ? "" : "s"} across ${problems} problem${problems === 1 ? "" : "s"} in ${esc(windowWord)}.</p>
<ul style="margin:0;padding-left:18px;font:14px system-ui;line-height:1.55;color:#222">${rows}</ul>
${d.groups.length > 10 ? `<p style="font:13px system-ui;color:#555">…and ${d.groups.length - 10} more, in the monitor.</p>` : ""}
<p style="font:12px system-ui;color:#888;margin-top:16px">Diagnoses are AI drafts read off scrubbed error metadata — check the monitor before acting on one.</p>
</div>`;

  return { subject, text: lines.join("\n"), html };
}
