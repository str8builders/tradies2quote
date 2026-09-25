// ── Weather planning orchestrator ──────────────────────────────────────────
// One path used by BOTH the cron jobs and the on-demand (user) route, so the
// behaviour is identical everywhere. Sequence:
//   quote(+site context) → location → forecast (cached) → DETERMINISTIC engine
//   → store assessment → Pat (if pat_should_run) → store recommendation
//   → Willa (if willa_should_run) → store DRAFT message (never sent).
//
// Ownership of the hard rules:
//   • Weather source of truth ......... provider.ts (Open-Meteo)
//   • Risk decision ................... risk-engine.ts (thresholds from DB only)
//   • Field interpretation ............ agents/pat.ts (no thresholds, no fetch)
//   • Customer comms DRAFTS ........... agents/willa.ts (review required)
// All writes go through the service-role admin client and are scoped by an
// explicit userId, so cron (no session) and user routes share one code path.

import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import { captureError } from "@/lib/observability";
import { describeAiError } from "@/lib/ai/errors";
import { adminClient } from "@/lib/supabase/admin";
import { runPat } from "@/lib/agents/pat";
import { runWilla } from "@/lib/agents/willa";
import { isLocalTextAiProvider } from "@/lib/llm/local-chat";
import { fetchForecastForWindow } from "./provider";
import { geocodeAddress } from "./geocode";
import { pickJobAddress } from "./jobAddress";
import { evaluateJobWeather } from "./risk-engine";
import { getRuleFallback, ruleFromRow } from "./rules";
import { guessJobType, isKnownJobType } from "./job-type";
import type {
  AlternateJob,
  CompanyContext,
  ForecastSnapshot,
  JobPayload,
  JobTypeRule,
  PatOutput,
  WeatherAssessment,
  WillaOutput,
} from "./types";

export type TriggerSource = "on_change" | "evening" | "morning" | "prejob" | "manual";

export interface AssessJobInput {
  quoteId: string;
  userId: string;
  triggerSource: TriggerSource;
  /** Run Pat/Willa LLMs (default true; cron may disable for a dry pass). */
  runAgents?: boolean;
  apiKey?: string;
  now?: string;
  fetchImpl?: typeof fetch;
}

export type AssessJobResult =
  | { status: "skipped"; reason: string }
  | {
      status: "assessed";
      assessmentId: string;
      assessment: WeatherAssessment;
      pat: PatOutput | null;
      willa: WillaOutput | null;
    };

const FORECAST_TTL_MS = 60 * 60 * 1000; // 1h cache freshness

export async function assessJob(input: AssessJobInput): Promise<AssessJobResult> {
  const db = adminClient();
  const now = input.now ?? new Date().toISOString();

  // 1. Load the quote (= the "job"). Must be scheduled + owned + dated.
  const { data: quote } = await db
    .from("quotes")
    .select("id, user_id, status, scheduled_for, client_id, quote_data")
    .eq("id", input.quoteId)
    .maybeSingle();
  if (!quote || quote.user_id !== input.userId) return { status: "skipped", reason: "quote_not_found" };
  if (quote.status !== "scheduled") return { status: "skipped", reason: "not_scheduled" };
  if (!quote.scheduled_for) return { status: "skipped", reason: "no_date" };

  // 2. Site context (job_type, indoor/outdoor, lat/lon, timezone).
  const { data: ctxRow } = await db
    .from("quote_site_context")
    .select("quote_id, job_type, indoor_outdoor, latitude, longitude, timezone, geocoded_address")
    .eq("quote_id", input.quoteId)
    .maybeSingle();

  const summary = readJobSummary(quote.quote_data);
  let jobType = ctxRow?.job_type ?? guessJobType(summary);
  if (!isKnownJobType(jobType)) return { status: "skipped", reason: "job_type_unknown" };
  jobType = jobType as string;

  // 3. Location — use stored lat/lon, else geocode the client's address once.
  let lat = ctxRow?.latitude ?? null;
  let lon = ctxRow?.longitude ?? null;
  let timezone = ctxRow?.timezone ?? null;
  let geocoded = ctxRow?.geocoded_address ?? null;

  if (lat == null || lon == null) {
    // P0 weather-location spine: clients.address first (when a client record
    // is linked), else the per-quote client snapshot in quote_data — today the
    // only populated source, since nothing writes the clients table yet.
    // Neither present → explicit skip; this path NEVER uses device location.
    const clientsAddress = await loadClientAddress(db, quote.client_id);
    const picked = pickJobAddress({ clientsAddress, quoteData: quote.quote_data });
    if (!picked) return { status: "skipped", reason: "no_address" };
    const geo = await geocodeAddress({ address: picked.address, fetchImpl: input.fetchImpl });
    if (!geo) return { status: "skipped", reason: "location_unknown" };
    lat = geo.latitude;
    lon = geo.longitude;
    timezone = geo.timezone;
    geocoded = geo.matchedName;
    console.log("[weather-planning] job location resolved", {
      quoteId: input.quoteId,
      source: picked.source,
      matched: geo.matchedName,
    });
  }

  const indoorOutdoor = (ctxRow?.indoor_outdoor as JobPayload["indoor_outdoor"]) ?? "outdoor";

  // Persist resolved context so we don't geocode again next run.
  await db.from("quote_site_context").upsert(
    {
      quote_id: input.quoteId,
      user_id: input.userId,
      job_type: jobType,
      indoor_outdoor: indoorOutdoor,
      latitude: lat,
      longitude: lon,
      timezone,
      geocoded_address: geocoded,
      updated_at: now,
    },
    { onConflict: "quote_id" },
  );

  // 4. Build the job window from scheduled_for (+ daytime heuristic).
  const window = buildWindow(quote.scheduled_for, timezone ?? "Pacific/Auckland");

  // 5. Forecast — cache by rounded location + window start (best-effort).
  const rule = await loadRule(db, jobType);
  const forecast = await getForecast(db, {
    jobId: input.quoteId,
    lat,
    lon,
    window,
    now,
    fetchImpl: input.fetchImpl,
  });

  // 6. DETERMINISTIC assessment (the only place risk is decided).
  const assessment = evaluateJobWeather({ jobId: input.quoteId, rule, forecast, now });

  // 7. Store the assessment with full triggers_fired + forecast snapshot (audit).
  const { data: stored, error: storeErr } = await db
    .from("job_weather_assessments")
    .insert({
      user_id: input.userId,
      quote_id: input.quoteId,
      job_type: jobType,
      provider: forecast.provider,
      generated_at: now,
      window_start: window.start,
      window_end: window.end,
      risk_level: assessment.risk_level,
      risk_types: assessment.risk_types,
      triggers_fired: assessment.triggers_fired as unknown as Json,
      summary: assessment.summary,
      recommended_action: assessment.recommended_action,
      customer_comms_needed: assessment.customer_comms_needed,
      pat_should_run: assessment.pat_should_run,
      willa_should_run: assessment.willa_should_run,
      forecast_snapshot: forecast as unknown as Json,
      trigger_source: input.triggerSource,
    })
    .select("id")
    .single();
  if (storeErr || !stored) throw new Error(`store assessment failed: ${storeErr?.message ?? "unknown"}`);
  const assessmentId = stored.id;

  // 8. Pat + Willa — only if the engine flagged them and a key exists.
  const runAgents = input.runAgents ?? true;
  const apiKey =
    input.apiKey ??
    (isLocalTextAiProvider()
      ? process.env.LOCAL_LLM_API_KEY
      : process.env.ANTHROPIC_API_KEY);
  let pat: PatOutput | null = null;
  let willa: WillaOutput | null = null;

  if (runAgents && apiKey && assessment.pat_should_run) {
    const job = buildJobPayload({ quote, jobType, indoorOutdoor, lat, lon, timezone, summary });
    const alternates = await loadAlternateJobs(db, input.userId, input.quoteId, quote.scheduled_for);
    try {
      const patRes = await runPat({ job, forecast, assessment, alternateJobs: alternates, userId: input.userId, quoteId: input.quoteId, apiKey, fetchImpl: input.fetchImpl });
      pat = patRes.value;
      await db.from("ai_recommendations").insert({
        user_id: input.userId,
        quote_id: input.quoteId,
        assessment_id: assessmentId,
        agent: "pat",
        output: pat as unknown as Json,
        model: patRes.model,
      });

      // Willa only when the engine says customer comms are needed AND Pat ran.
      if (assessment.willa_should_run) {
        const company = await loadCompanyContext(db, input.userId);
        const willaRes = await runWilla({ job, assessment, patOutput: pat, companyContext: company, userId: input.userId, quoteId: input.quoteId, apiKey, fetchImpl: input.fetchImpl });
        willa = willaRes.value;
        await db.from("customer_message_drafts").insert({
          user_id: input.userId,
          quote_id: input.quoteId,
          assessment_id: assessmentId,
          // status defaults to 'draft' — NOTHING here sends it.
          channel: willa.should_contact_customer ? willa.suggested_channel : "none",
          message: willa.customer_message,
          internal_note: willa.internal_note,
          reason: willa.reason,
          confidence: willa.confidence,
          model: willaRes.model,
        });
      }
    } catch (err) {
      // Agents are best-effort: a deterministic assessment is already stored.
      // Reported (never silent): the typed AiError says which call failed.
      console.error("weather-planning agents failed", input.quoteId, describeAiError(err));
      captureError(err, { route: "weather-planning/assess" });
    }
  }

  return { status: "assessed", assessmentId, assessment, pat, willa };
}

// ── helpers ────────────────────────────────────────────────────────────────

function readJobSummary(quoteData: unknown): string | null {
  if (quoteData && typeof quoteData === "object") {
    const v = (quoteData as Record<string, unknown>).job_summary;
    if (typeof v === "string") return v;
    const name = (quoteData as Record<string, unknown>).jobName;
    if (typeof name === "string") return name;
  }
  return null;
}

async function loadClientAddress(db: ReturnType<typeof adminClient>, clientId: string | null): Promise<string | null> {
  if (!clientId) return null;
  const { data } = await db.from("clients").select("address").eq("id", clientId).maybeSingle();
  return data?.address ?? null;
}

async function loadRule(db: ReturnType<typeof adminClient>, jobType: string): Promise<JobTypeRule> {
  const { data } = await db
    .from("job_type_rules")
    .select("job_type, display_name, outdoor, risk_thresholds, default_actions")
    .eq("job_type", jobType)
    .maybeSingle();
  if (data) return ruleFromRow(data);
  const fallback = getRuleFallback(jobType);
  if (!fallback) throw new Error(`no rule for job_type ${jobType}`);
  return fallback;
}

/**
 * Window from scheduled_for. If the local time looks like a date-only midnight
 * (hour ≤ 6), assume a daytime block 07:00–17:00 local by shifting the epoch
 * (adding hours shifts the local clock by the same amount). Otherwise use the
 * scheduled time + 8h.
 */
export function buildWindow(scheduledFor: string, timezone: string): { start: string; end: string } {
  const startMs = Date.parse(scheduledFor);
  const lh = localHour(startMs, timezone);
  const H = 60 * 60 * 1000;
  if (lh <= 6) {
    return { start: new Date(startMs + 7 * H).toISOString(), end: new Date(startMs + 17 * H).toISOString() };
  }
  return { start: new Date(startMs).toISOString(), end: new Date(startMs + 8 * H).toISOString() };
}

function localHour(ms: number, timezone: string): number {
  try {
    const s = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hour12: false }).format(new Date(ms));
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? n % 24 : 0;
  } catch {
    return new Date(ms).getUTCHours();
  }
}

interface ForecastArgs {
  jobId: string;
  lat: number;
  lon: number;
  window: { start: string; end: string };
  now: string;
  fetchImpl?: typeof fetch;
}

async function getForecast(db: ReturnType<typeof adminClient>, a: ForecastArgs): Promise<ForecastSnapshot> {
  const locationKey = `${a.lat.toFixed(2)},${a.lon.toFixed(2)}`;
  // Cache read (best-effort): fresh row for this location + window.
  const { data: cached } = await db
    .from("weather_forecasts_cache")
    .select("hourly, alerts, generated_at, window_start, window_end, expires_at")
    .eq("location_key", locationKey)
    .eq("window_start", a.window.start)
    .gt("expires_at", a.now)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (cached) {
    return {
      provider: "open_meteo",
      generated_at: cached.generated_at,
      job_id: a.jobId,
      latitude: a.lat,
      longitude: a.lon,
      timezone: "UTC",
      window: a.window,
      hourly: (cached.hourly ?? []) as unknown as ForecastSnapshot["hourly"],
      alerts: (cached.alerts ?? []) as unknown as ForecastSnapshot["alerts"],
    };
  }

  const forecast = await fetchForecastForWindow({
    jobId: a.jobId,
    latitude: a.lat,
    longitude: a.lon,
    windowStart: a.window.start,
    windowEnd: a.window.end,
    now: a.now,
    fetchImpl: a.fetchImpl,
  });

  // Cache write (best-effort; service role only).
  await db
    .from("weather_forecasts_cache")
    .insert({
      location_key: locationKey,
      latitude: a.lat,
      longitude: a.lon,
      provider: forecast.provider,
      window_start: a.window.start,
      window_end: a.window.end,
      generated_at: a.now,
      expires_at: new Date(Date.parse(a.now) + FORECAST_TTL_MS).toISOString(),
      hourly: forecast.hourly as unknown as Json,
      alerts: forecast.alerts as unknown as Json,
    })
    .then(() => undefined, () => undefined);

  return forecast;
}

function buildJobPayload(a: {
  quote: { id: string };
  jobType: string;
  indoorOutdoor: JobPayload["indoor_outdoor"];
  lat: number;
  lon: number;
  timezone: string | null;
  summary: string | null;
}): JobPayload {
  return {
    job_id: a.quote.id,
    title: a.summary ?? "Scheduled job",
    job_type: a.jobType,
    indoor_outdoor: a.indoorOutdoor,
    location: { lat: a.lat, lon: a.lon },
    timezone: a.timezone,
    scheduled_start: "",
    scheduled_end: "",
  };
}

async function loadAlternateJobs(
  db: ReturnType<typeof adminClient>,
  userId: string,
  excludeQuoteId: string,
  scheduledFor: string,
): Promise<AlternateJob[]> {
  const dayStart = new Date(Date.parse(scheduledFor)); dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
  const { data } = await db
    .from("quotes")
    .select("id, scheduled_for, quote_data")
    .eq("user_id", userId)
    .eq("status", "scheduled")
    .neq("id", excludeQuoteId)
    .gte("scheduled_for", dayStart.toISOString())
    .lt("scheduled_for", dayEnd.toISOString())
    .limit(3);
  return (data ?? []).map((q) => ({
    job_id: q.id,
    title: readJobSummary(q.quote_data) ?? "Scheduled job",
    job_type: guessJobType(readJobSummary(q.quote_data)) ?? "unknown",
    scheduled_start: q.scheduled_for ?? "",
  }));
}

async function loadCompanyContext(db: ReturnType<typeof adminClient>, userId: string): Promise<CompanyContext> {
  const { data } = await db.from("profiles").select("business_name").eq("id", userId).maybeSingle();
  return {
    business_name: data?.business_name ?? "Your business",
    service_area: "your service area",
    tone: "clear, practical, tradie-friendly",
  };
}
