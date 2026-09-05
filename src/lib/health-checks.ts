/**
 * Server-only health probes used by `/app/debug`.
 *
 * Each function returns `{ status: "ok" | "missing" | "error" }` plus a
 * short human-readable detail string. **No secret values, key prefixes,
 * key lengths, or anything else that could leak into a screenshot are
 * ever included** — we only ever say "configured" / "not set" / "error".
 *
 * This module is imported only from server components (the debug page
 * is a server component) so it never enters the client bundle, but we
 * keep secrets out of every return value anyway as a defence-in-depth.
 */

import { createClient } from "@/lib/supabase/server";

export type HealthStatus = "ok" | "missing" | "error";

export interface HealthCheck {
  /** Stable id used as React key. */
  id: string;
  /** Display name. */
  name: string;
  /** Status bucket — ok / missing / error. */
  status: HealthStatus;
  /** One-line human detail. Never contains secrets. */
  detail: string;
}

/** Truthy env-var check. Avoids logging the value, only its presence. */
function envSet(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

/** Returns "configured" / "not set" — never the value itself. */
function envStatus(name: string): { status: HealthStatus; detail: string } {
  return envSet(name)
    ? { status: "ok", detail: "Configured" }
    : { status: "missing", detail: `Env var ${name} is not set` };
}

async function checkSupabase(): Promise<HealthCheck> {
  try {
    const supabase = await createClient();
    // Cheap read against `profiles` — RLS-scoped to the caller, so this
    // either returns the caller's own row, no rows, or an error. We
    // don't inspect the data; we only need to know the round-trip works.
    const { error } = await supabase.from("profiles").select("id").limit(1);
    if (error) {
      return {
        id: "supabase",
        name: "Supabase",
        status: "error",
        detail: "Connected but the test query failed",
      };
    }
    return {
      id: "supabase",
      name: "Supabase",
      status: "ok",
      detail: "Auth + DB reachable from the server",
    };
  } catch {
    return {
      id: "supabase",
      name: "Supabase",
      status: "error",
      detail: "Could not reach Supabase",
    };
  }
}

function localTextReady(): boolean {
  return (
    process.env.TEXT_AI_PROVIDER?.trim().toLowerCase() === "local" &&
    envSet("LOCAL_LLM_BASE_URL") &&
    envSet("LOCAL_LLM_MODEL") &&
    envSet("LOCAL_LLM_API_KEY")
  );
}

function checkLocalTextAi(): HealthCheck {
  const ready = localTextReady();
  return {
    id: "local-text-ai",
    name: "AI text + quote generator (local Qwen)",
    status: ready ? "ok" : "missing",
    detail: ready
      ? "Private local text model configured"
      : "Local text model configuration is incomplete",
  };
}

function checkVisionAi(): HealthCheck {
  const ready = envSet("ANTHROPIC_API_KEY") || envSet("OPENAI_API_KEY");
  return {
    id: "vision-ai",
    name: "Image / plan reading (optional external AI)",
    status: ready ? "ok" : "missing",
    detail: ready
      ? "An external vision provider is configured"
      : "Not configured — the local Qwen model is text-only",
  };
}

function checkTranscription(): HealthCheck {
  const r = envStatus("OPENAI_API_KEY");
  return {
    id: "transcription",
    name: "Voice transcription (OpenAI Whisper)",
    status: r.status,
    detail: r.detail,
  };
}

function checkResend(): HealthCheck {
  const r = envStatus("RESEND_API_KEY");
  return {
    id: "resend",
    name: "Quote email (Resend)",
    status: r.status,
    detail: r.detail,
  };
}

function checkTrialEmails(): HealthCheck {
  const r = envStatus("CRON_SECRET");
  return {
    id: "trial-emails",
    name: "Trial / onboarding emails (Vercel Cron)",
    status: r.status,
    detail:
      r.status === "ok"
        ? "Cron secret configured. Hourly job at /api/cron/trial-emails."
        : "CRON_SECRET not set — automated trial emails won't fire.",
  };
}

function checkStripe(): HealthCheck {
  const sk = envSet("STRIPE_SECRET_KEY");
  const wh = envSet("STRIPE_WEBHOOK_SECRET");
  const price = envSet("STRIPE_PRICE_ID");
  if (sk && wh && price) {
    return {
      id: "stripe",
      name: "Subscriptions (Stripe)",
      status: "ok",
      detail: "Secret key, webhook secret and price id are configured.",
    };
  }
  const missing = [
    !sk ? "STRIPE_SECRET_KEY" : null,
    !wh ? "STRIPE_WEBHOOK_SECRET" : null,
    !price ? "STRIPE_PRICE_ID" : null,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    id: "stripe",
    name: "Subscriptions (Stripe)",
    status: "missing",
    detail: `Not set: ${missing}`,
  };
}

function checkTwilio(): HealthCheck {
  const sid = envSet("TWILIO_ACCOUNT_SID");
  const token = envSet("TWILIO_AUTH_TOKEN");
  const from = envSet("TWILIO_FROM_NUMBER");
  if (sid && token && from) {
    return {
      id: "twilio",
      name: "Quote SMS (Twilio)",
      status: "ok",
      detail: "Configured",
    };
  }
  const missing = [
    !sid ? "TWILIO_ACCOUNT_SID" : null,
    !token ? "TWILIO_AUTH_TOKEN" : null,
    !from ? "TWILIO_FROM_NUMBER" : null,
  ]
    .filter(Boolean)
    .join(", ");
  return {
    id: "twilio",
    name: "Quote SMS (Twilio)",
    status: "missing",
    detail: `Not set: ${missing}`,
  };
}

function checkStorage(): HealthCheck {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return {
      id: "storage",
      name: "Supabase storage",
      status: "missing",
      detail: "NEXT_PUBLIC_SUPABASE_URL is not set",
    };
  }
  return {
    id: "storage",
    name: "Supabase storage",
    status: "ok",
    detail: "Storage endpoint configured",
  };
}

/**
 * Aggregate all health checks. Caller is expected to be the owner-only
 * debug page; this function does NO authorization itself.
 */
export async function getAllHealthChecks(): Promise<HealthCheck[]> {
  // Supabase needs a server-side fetch; everything else is sync.
  const [supabase] = await Promise.all([checkSupabase()]);
  return [
    supabase,
    checkLocalTextAi(),
    checkVisionAi(),
    checkTranscription(),
    checkResend(),
    checkTwilio(),
    checkTrialEmails(),
    checkStripe(),
    checkStorage(),
  ];
}

/**
 * Wave 12 — readiness probe for each of the five named agents.
 *
 * "Ready" agents are the pure rule-based ones that need nothing
 * beyond Supabase + the user's own data. None of the agents require
 * an API key by themselves; they only need Supabase to read context.
 *
 * Reports also surface the related env-var status (already covered
 * by the health checks above) so the owner can see at a glance which
 * future AI-powered agents are unlocked. Never exposes env values.
 */
export interface AgentReadiness {
  id: string;
  name: string;
  status: "ready" | "needs-setup" | "coming-later";
  detail: string;
}

export function getAgentReadiness(): AgentReadiness[] {
  return [
    {
      id: "quote-review",
      name: "Quote Review Agent",
      status: "ready",
      detail: "Pure rule-based. Reads quote_data only.",
    },
    {
      id: "compliance",
      name: "Compliance Agent",
      status: "ready",
      detail: "Pure rule-based. Flags risky wording + suggests clauses.",
    },
    {
      id: "voice-cleanup",
      name: "Voice Cleanup Agent",
      status: "ready",
      detail:
        "Pure rule-based. No AI call; trims fillers + corrects NZ-trade spelling (H-classes, GIB, sizes) on the saved transcript.",
    },
    {
      id: "followup",
      name: "Follow-up Agent",
      status: "ready",
      detail: "Template-based. Copy-to-clipboard only — never sends.",
    },
    {
      id: "admin",
      name: "Admin Agent",
      status: "ready",
      detail: "Pure rule-based. Reads profile + clients to flag setup gaps.",
    },
    {
      id: "ai-quote",
      name: "AI Quote Builder (existing route)",
      status: localTextReady() ? "ready" : "needs-setup",
      detail: localTextReady()
        ? "Private local Qwen configured. /api/quotes/generate uses the local model."
        : "Local text AI configuration is incomplete — quote generation will fail.",
    },
    {
      id: "voice-transcribe",
      name: "Voice Transcribe (existing route)",
      status: envSet("OPENAI_API_KEY") ? "ready" : "needs-setup",
      detail: envSet("OPENAI_API_KEY")
        ? "OpenAI key configured. The existing /api/quotes/transcribe route is the agent."
        : "OPENAI_API_KEY not set — voice transcription will fail.",
    },
    {
      id: "invoice",
      name: "Invoice Agent",
      status: "ready",
      detail:
        "Drafts invoices from accepted quotes via runInvoiceAgent. Browse them at /app/invoices.",
    },
  ];
}

/**
 * Build-time / deploy-time identity, sourced entirely from
 * Vercel-injected env vars. None of these are secrets — Vercel sets them
 * automatically on every build and they're already visible in the
 * x-vercel-id response header.
 */
export interface BuildIdentity {
  commitSha: string | null;
  commitMessage: string | null;
  branch: string | null;
  vercelEnv: string | null;
  vercelUrl: string | null;
  nodeEnv: string;
}

export function getBuildIdentity(): BuildIdentity {
  return {
    commitSha: process.env.APP_COMMIT_SHA ?? process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE ?? null,
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    vercelUrl: process.env.VERCEL_URL ?? null,
    nodeEnv: process.env.NODE_ENV,
  };
}
