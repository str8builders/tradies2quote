import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isLocalTextAiProvider,
  resolveLocalLlmConfig,
  runLocalChatCompletion,
} from "@/lib/llm/local-chat";
import {
  type Diagnosis,
  type DigestGroup,
  type ErrorDigestData,
  type GroupRow,
  type WindowEvent,
  parseDiagnoses,
  summariseWindow,
} from "./errors";

// ─────────────────────────────────────────────────────────────────────────
// Morning error digest — data collection (I/O) + AI triage.
//
// Reads ONLY the internal monitor's own tables (`app_error_events`,
// `app_error_groups`) — the rows are PII-free by construction (see
// observability/fingerprint.ts: messages and stacks are scrubbed before
// they are ever written), which is what makes handing them to a model for
// triage acceptable. Production rows only: the owner's morning does not
// need to hear about localhost.
//
// Everything is soft. No API key → digest sends without diagnoses. Query
// failure → empty digest, never a thrown cron. The email is the product;
// the AI paragraph is garnish.
// ─────────────────────────────────────────────────────────────────────────

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));
const strOrNull = (v: unknown): string | null => (typeof v === "string" ? v : null);

export async function collectErrorDigest(
  admin: SupabaseClient,
  opts: {
    windowDays?: number;
    now?: Date;
    /** Test seam — replaces the Anthropic call. */
    diagnose?: (groups: DigestGroup[]) => Promise<Diagnosis[]>;
  } = {},
): Promise<ErrorDigestData> {
  const windowDays = opts.windowDays ?? 1;
  const now = opts.now ?? new Date();
  const sinceIso = new Date(now.getTime() - windowDays * 86_400_000).toISOString();

  const empty: ErrorDigestData = {
    windowDays,
    totalEvents: 0,
    groups: [],
    diagnoses: [],
  };

  let events: WindowEvent[] = [];
  let groups: GroupRow[] = [];
  try {
    const eventsRes = await admin
      .from("app_error_events")
      .select("group_id, fingerprint, name, message, surface, route, occurred_at")
      .eq("environment", "production")
      .gte("occurred_at", sinceIso)
      .order("occurred_at", { ascending: false })
      .limit(2000);
    events = ((eventsRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
      group_id: strOrNull(r.group_id),
      fingerprint: str(r.fingerprint),
      name: strOrNull(r.name),
      message: strOrNull(r.message),
      surface: str(r.surface),
      route: strOrNull(r.route),
      occurred_at: str(r.occurred_at),
    }));
    if (events.length === 0) return empty;

    const ids = [...new Set(events.map((e) => e.group_id).filter(Boolean))] as string[];
    if (ids.length > 0) {
      const groupsRes = await admin
        .from("app_error_groups")
        .select(
          "id, fingerprint, title, surface, route, event_count, first_seen_at, last_seen_at, resolved_at",
        )
        .in("id", ids);
      groups = ((groupsRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
        id: str(r.id),
        fingerprint: str(r.fingerprint),
        title: str(r.title),
        surface: str(r.surface),
        route: strOrNull(r.route),
        event_count: Number(r.event_count) || 0,
        first_seen_at: strOrNull(r.first_seen_at),
        last_seen_at: strOrNull(r.last_seen_at),
        resolved_at: strOrNull(r.resolved_at),
      }));
    }
  } catch (err) {
    console.error("[error-digest] collection failed", err);
    return empty;
  }

  const summary = summariseWindow(events, groups, sinceIso);

  // AI triage for the few worth a diagnosis. Failure leaves the digest
  // intact — it just arrives without the diagnosis lines.
  let diagnoses: Diagnosis[] = [];
  try {
    const top = summary.groups.slice(0, 3);
    const diagnose = opts.diagnose ?? defaultDiagnose;
    if (top.length > 0) diagnoses = await diagnose(top);
  } catch (err) {
    console.error("[error-digest] diagnosis failed", err);
  }

  return {
    windowDays,
    totalEvents: summary.totalEvents,
    groups: summary.groups,
    diagnoses,
  };
}

// ── The Anthropic call ────────────────────────────────────────────────────

/**
 * One request for the whole batch, not one per group: the groups often
 * share a cause (a deploy, an outage), and a model that sees all three can
 * say so instead of diagnosing the same incident three times.
 */
async function defaultDiagnose(groups: DigestGroup[]): Promise<Diagnosis[]> {
  try {
    if (!isLocalTextAiProvider()) return [];
    resolveLocalLlmConfig();
  } catch {
    return [];
  }

  const system = [
    "You are a senior engineer triaging the internal error monitor of Tradies2Quote,",
    "a Next.js + self-hosted Supabase quoting SaaS for NZ tradespeople, with a native",
    "iOS calculator app (T2QCAL) that reports its crashes to the same monitor",
    "(surface \"client\", route \"/t2qcal\"). The error text you see has already been",
    "scrubbed of PII and secrets, and truncated.",
    "",
    "For each error group, reply with your best diagnosis from the metadata alone.",
    "Be specific and honest about uncertainty — a wrong confident diagnosis costs a",
    "morning; \"unclear, look at X first\" does not. If several groups look like one",
    "underlying incident, say so in each next_step.",
    "",
    "Reply with ONLY a JSON array, one entry per group, in this exact shape:",
    '[{"fingerprint": "...", "likely_cause": "one or two sentences",',
    '"severity": "high|medium|low", "next_step": "one concrete action"}]',
  ].join("\n");

  const user = JSON.stringify(
    groups.map((g) => ({
      fingerprint: g.fingerprint,
      title: g.title,
      surface: g.surface,
      route: g.route,
      events_in_window: g.windowCount,
      events_lifetime: g.lifetimeCount,
      brand_new: g.isNew,
      resurfaced_after_being_resolved: g.resurfaced,
      first_seen: g.firstSeenAt,
      last_seen: g.lastSeenAt,
    })),
    null,
    2,
  );

  const result = await runLocalChatCompletion({
    system,
    user,
    maxTokens: 1200,
    temperature: 0,
    responseSchema: {
      name: "error_diagnoses",
      schema: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["fingerprint", "likely_cause", "severity", "next_step"],
          properties: {
            fingerprint: { type: "string" },
            likely_cause: { type: "string" },
            severity: { type: "string", enum: ["high", "medium", "low"] },
            next_step: { type: "string" },
          },
        },
      },
    },
  });
  return parseDiagnoses(result.text);
}
