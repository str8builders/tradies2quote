import "server-only";
// ─────────────────────────────────────────────────────────────────────────
// Plan-set reader — shared route plumbing: the guard every route runs
// (signed in → owner-only flag → AI consent → quota → can write), the
// untyped db clients (the plan_set tables aren't in database.types yet),
// starting the background job after the response, and the status body.
// ─────────────────────────────────────────────────────────────────────────

import { after, NextResponse } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { aiConsentGate } from "@/lib/ai-consent";
import { canWrite, getSubscriptionStatus } from "@/lib/subscription";
import { trialEndedResponse } from "@/lib/trial-ended-response";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";
import { planReaderAllowed } from "@/lib/planreader/flag";
import { PLAN_SET_LEASE_MS, runPlanSetJob } from "./job";

export type Guarded = { db: SupabaseClient; user: User };

/** The checks every plan-set route runs, in order. Returns a response to send, or the caller. */
export async function planSetGuard(opts: { write?: boolean; quota?: [string, number] } = {}): Promise<Guarded | NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Owner-only until the real-plan evals pass: hide the routes from everyone else.
  if (!planReaderAllowed(user.email)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const consent = await aiConsentGate(supabase, user.id);
  if (consent) return consent;
  if (opts.quota) {
    const q = consumeDailyQuota(`${opts.quota[0]}:${user.id}`, opts.quota[1]);
    if (!q.ok) return tooManyRequestsResponse(q.resetAt);
  }
  if (opts.write) {
    const sub = await getSubscriptionStatus({ userId: user.id, signedUpAt: new Date(user.created_at ?? Date.now()), email: user.email });
    if (!canWrite(sub)) return trialEndedResponse("Your free trial has ended. Subscribe to keep reading plans.");
  }
  return { db: supabase as unknown as SupabaseClient, user };
}

export function adminDb(): SupabaseClient {
  return adminClient() as unknown as SupabaseClient;
}

/** Run the reading job after the response (inline where `after` isn't available, e.g. tests). */
export function startJobAfterResponse(setId: string): void {
  const job = () => runPlanSetJob(setId).catch(() => undefined);
  try {
    after(job);
  } catch {
    void job();
  }
}

export type PlanSetRow = {
  id: string;
  user_id: string;
  quote_id: string | null;
  original_filename: string;
  byte_size: number;
  page_count: number | null;
  storage_path: string;
  status: "uploading" | "queued" | "reading" | "ready" | "failed";
  step: string | null;
  progress: { done?: number; total?: number } | null;
  register: unknown;
  model: unknown;
  answers: Record<string, unknown>;
  takeoff: unknown;
  error: string | null;
  lease_at: string | null;
  created_at: string;
  updated_at: string;
};

/** A read that stopped (server restart) is picked up again on the next poll. */
export function isStalled(row: Pick<PlanSetRow, "status" | "lease_at" | "updated_at">, now = Date.now()): boolean {
  if (row.status === "queued") return !row.lease_at && now - Date.parse(row.updated_at) > 15_000;
  if (row.status !== "reading") return false;
  return !row.lease_at || now - Date.parse(row.lease_at) > PLAN_SET_LEASE_MS;
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
