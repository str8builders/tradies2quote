"use server";

import { redirect } from "next/navigation";
import { captureError } from "@/lib/observability";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  clampMarkupPct,
  clampTaxRate,
  computeQuoteTotals,
  round2,
} from "@/lib/quote-defaults";
import { applyMaterialCorrections } from "@/lib/quoteEditLearning";
import { buildQuoteEditDiff, diffIsNonEmpty } from "@/lib/quoteEditDiff";
import { confirmAndRecalc, type DimensionEdit } from "@/lib/dimensionConfirmation";
import { isOwnerEmail } from "@/lib/owner";
import { suggestPriceAgentEnabledFromEnv } from "@/lib/agents/suggestPrice";
import { normalizeSuggestedMaterial } from "@/lib/agents/suggestPrice/apply";
import {
  ingestFromAcceptedPrice,
  ingestFromQuoteSave,
} from "@/lib/tradieBrain/ingest";
import type {
  DimensionConfirmation,
  QuoteData,
  QuoteLineItem,
  QuoteStatus,
} from "@/lib/quote-types";
import { assessQuoteTakeoffSafety } from "@/lib/quote-validation";
import { canTransition } from "@/lib/lifecycle/stages";
import {
  isQuoteLocked,
  QUOTE_LOCKED_MESSAGE,
  QUOTE_LOCKED_SQLSTATE,
} from "@/lib/lifecycle/lock";
import {
  logAgentError,
  logAgentEvent,
} from "@/lib/agent-monitor/logger";

type SaveResult =
  | { ok: true; materialsLearned?: number }
  | { error: string };

export async function saveQuoteChanges(
  id: string,
  data: QuoteData,
): Promise<SaveResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: priorRow } = await supabase
    .from("quotes")
    .select("quote_data, ai_snapshot, status, user_id")
    .eq("id", id)
    .single();
  // RLS already scopes this, but check ownership explicitly so a
  // missing / not-owned quote fails loudly here instead of silently
  // updating zero rows below and reporting a false success.
  if (!priorRow || priorRow.user_id !== user.id) {
    return { error: "Quote not found." };
  }
  // Accepted and every later stage (scheduled, in progress, completed…) is
  // the agreed contract that invoicing bills — never just "accepted".
  if (isQuoteLocked(priorRow.status)) {
    return { error: QUOTE_LOCKED_MESSAGE };
  }
  const prior = (priorRow.quote_data ?? null) as QuoteData | null;
  // ai_snapshot is the frozen baseline — never mutated after generation.
  // Older quotes (pre-Wave-40) have no snapshot; fall back to the
  // current quote_data so the first edit still logs something useful.
  const aiSnapshot =
    ((priorRow as { ai_snapshot?: unknown }).ai_snapshot as QuoteData | null) ??
    prior;

  const items = (data.line_items ?? []).map((it) => {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.unit_price) || 0;
    return { ...it, quantity: qty, unit_price: price, line_total: round2(qty * price) };
  });
  const markup_pct = clampMarkupPct(data.markup_pct);
  const tax_rate = clampTaxRate(data.tax_rate);
  const totals = computeQuoteTotals(items, markup_pct, tax_rate);
  const total = totals.total;

  const next: QuoteData = {
    ...data,
    line_items: items,
    markup_pct,
    tax_rate,
    ...totals,
  };

  // Computed once: drives BOTH the correction-capture stamp below and the
  // Wave-40 eval-loop log further down. Diffed against the frozen AI
  // snapshot so a no-op save doesn't count as a human correction.
  const editDiff = buildQuoteEditDiff(aiSnapshot, next);
  const isHumanEdit = diffIsNonEmpty(editDiff);

  // Ops layer — when a human edits / completes a SUPPLIER-IMPORT quote, stamp
  // correction provenance on supplier_source so the extraction-review queue +
  // metrics know it was fixed. No re-extraction is implied (this is "a person
  // touched the numbers"). Non-supplier quotes and no-op saves are untouched.
  if (next.supplier_source && isHumanEdit) {
    const now = new Date().toISOString();
    next.supplier_source = {
      ...next.supplier_source,
      extraction_corrected: true,
      corrected_by: user.id,
      corrected_at: now,
    };
  }

  const { data: updatedRows, error: uErr } = await supabase
    .from("quotes")
    .update({
      quote_data: next,
      total_amount: total,
      currency: next.currency,
    })
    .eq("id", id)
    .select("id");
  if (uErr) {
    // The database lock trigger won a race with a customer accepting
    // between the status read above and this write.
    if (uErr.code === QUOTE_LOCKED_SQLSTATE) return { error: QUOTE_LOCKED_MESSAGE };
    captureError(new Error(`saveQuoteChanges update failed: ${uErr.message}`), {
      route: "actions/saveQuoteChanges",
      surface: "server_action",
    });
    console.error("saveQuoteChanges update failed", uErr);
    return { error: "Could not save changes." };
  }
  if (!updatedRows || updatedRows.length === 0) {
    // RLS blocked the write — zero rows changed but no error raised.
    // Fail rather than report a save that never happened.
    captureError(new Error("saveQuoteChanges updated 0 rows (RLS-blocked write)"), {
      route: "actions/saveQuoteChanges",
      surface: "server_action",
    });
    console.error("saveQuoteChanges updated 0 rows", { id });
    return { error: "Could not save changes." };
  }

  const { error: dErr } = await supabase
    .from("quote_items")
    .delete()
    .eq("quote_id", id);
  if (dErr) {
    console.error("saveQuoteChanges delete items failed", dErr);
    return { error: "Could not refresh line items." };
  }

  if (items.length > 0) {
    const { error: iErr } = await supabase.from("quote_items").insert(
      items.map((it) => ({
        quote_id: id,
        type: it.type,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        line_total: it.line_total,
      })),
    );
    if (iErr) {
      console.error("saveQuoteChanges insert items failed", iErr);
      return { error: "Could not write line items." };
    }
  }

  // Stage 4.6 — feed user line edits into the user-scoped material library.
  // Replaces the Stage 2.5 syncEditedMaterialsToLibrary helper. Always
  // wrapped in try-friendly orchestrator that returns counts and never
  // throws, so a learning failure cannot break a quote save.
  const learn = await applyMaterialCorrections(
    supabase,
    user.id,
    items,
    prior?.line_items ?? [],
  );

  // Wave 40 — log the AI-vs-tradie diff for the eval loop. Always
  // diffed against the frozen ai_snapshot, never against the previous
  // edit, so the signal stays clean across multiple saves. A failure never
  // fails the save (logging is a side benefit), but it is reported: the
  // client returns errors instead of throwing, so the old try/catch alone
  // hid every lost eval row. Only the SQLSTATE is recorded — Postgres
  // details can echo the failing row (client names, prices).
  if (isHumanEdit) {
    try {
      const { error: evErr } = await supabase.from("quote_edit_events").insert({
        quote_id: id,
        user_id: user.id,
        edited_data: next,
        diff: editDiff,
      });
      if (evErr) {
        captureError(
          new Error(`quote_edit_events insert failed: ${evErr.code ?? "unknown"}`),
          { route: "actions/saveQuoteChanges", surface: "server_action" },
        );
        console.warn("quote_edit_events insert failed (non-fatal)", { code: evErr.code });
      }
    } catch {
      captureError(new Error("quote_edit_events insert threw"), {
        route: "actions/saveQuoteChanges",
        surface: "server_action",
      });
      console.warn("quote_edit_events insert threw (non-fatal)");
    }
  }

  // Tradie Brain (v1, observe-only) — learn the tradie's own preferences from
  // this save: preferred materials/prices, supplier, exclusions, markup habit,
  // job type, and repeated corrections. Owner-only + soft-failing: it can
  // never block or undo the save above, and writes nothing for other users.
  // No memory is fed to any AI yet — this is silent collection only.
  await ingestFromQuoteSave(supabase, user, {
    quote: next,
    diff: isHumanEdit ? editDiff : null,
    quoteId: id,
  });

  return { ok: true, materialsLearned: learn.materialsLearned };
}

type ConfirmDimsResult =
  | {
      ok: true;
      lineItems: QuoteLineItem[];
      dimensionConfirmation: DimensionConfirmation;
      changed: boolean;
    }
  | { error: string };

/**
 * #1 — confirm (or correct) a risky drawing's key dimensions.
 *
 * Operates on the tradie's CURRENT quote data (passed from the editor, like
 * saveQuoteChanges) so any unsaved edits are preserved. Confirming with no
 * change keeps every number; correcting a dimension re-runs the SAME
 * deterministic calculator (never the AI) and replaces the calculator lines.
 * Records who confirmed and when. Persists quote + line items so the
 * pre-send gate (which hard-blocks until all required dims are confirmed)
 * unblocks.
 */
export async function confirmDimensions(
  id: string,
  data: QuoteData,
  edits: DimensionEdit[],
): Promise<ConfirmDimsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: priorRow } = await supabase
    .from("quotes")
    .select("status, user_id")
    .eq("id", id)
    .single();
  if (!priorRow || priorRow.user_id !== user.id) {
    return { error: "Quote not found." };
  }
  if (isQuoteLocked(priorRow.status)) {
    return { error: QUOTE_LOCKED_MESSAGE };
  }

  const result = confirmAndRecalc(data, edits, {
    confirmedBy: user.id,
    confirmedAt: new Date().toISOString(),
  });
  if (!result) {
    return { error: "There are no drawing dimensions to confirm on this quote." };
  }

  const items = result.line_items.map((it) => {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.unit_price) || 0;
    return { ...it, quantity: qty, unit_price: price, line_total: round2(qty * price) };
  });
  const markup_pct = clampMarkupPct(data.markup_pct);
  const tax_rate = clampTaxRate(data.tax_rate);
  const totals = computeQuoteTotals(items, markup_pct, tax_rate);

  const next: QuoteData = {
    ...data,
    line_items: items,
    markup_pct,
    tax_rate,
    ...totals,
    dimension_confirmation: result.dimension_confirmation,
  };

  const { data: updatedRows, error: uErr } = await supabase
    .from("quotes")
    .update({
      quote_data: next,
      total_amount: totals.total,
      currency: next.currency,
    })
    .eq("id", id)
    .select("id");
  if (uErr?.code === QUOTE_LOCKED_SQLSTATE) return { error: QUOTE_LOCKED_MESSAGE };
  if (uErr || !updatedRows || updatedRows.length === 0) {
    console.error("confirmDimensions update failed", uErr);
    captureError(uErr, { route: "action:confirmDimensions" });
    return { error: "Could not save the confirmation." };
  }

  const { error: dErr } = await supabase
    .from("quote_items")
    .delete()
    .eq("quote_id", id);
  if (dErr) {
    console.error("confirmDimensions delete items failed", dErr);
    captureError(dErr, { route: "action:confirmDimensions" });
    return { error: "Could not refresh line items." };
  }
  if (items.length > 0) {
    const { error: iErr } = await supabase.from("quote_items").insert(
      items.map((it) => ({
        quote_id: id,
        type: it.type,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        unit_price: it.unit_price,
        line_total: it.line_total,
      })),
    );
    if (iErr) {
      console.error("confirmDimensions insert items failed", iErr);
      captureError(iErr, { route: "action:confirmDimensions" });
      return { error: "Could not write line items." };
    }
  }

  console.log("[takeoff] dimensions confirmed", {
    quoteId: id,
    userId: user.id,
    changed: result.changed,
  });
  revalidatePath(`/app/quotes/preview/${id}`);
  return {
    ok: true,
    lineItems: items,
    dimensionConfirmation: result.dimension_confirmation,
    changed: result.changed,
  };
}

type SaveMaterialResult = { ok: true } | { error: string };

/**
 * #agents (Suggest-a-Price) — explicitly save a price the tradie ACCEPTED
 * into their materials library. This is the only write the agent flow can
 * trigger, and only on a human "Save to library" click. Owner + flag gated
 * (mirrors the route). Deduped by name. Never runs automatically; never sets
 * a quote total. Validation via normalizeSuggestedMaterial means no junk
 * (no name / $0 / NaN price) can ever be persisted.
 */
export async function saveSuggestedMaterial(input: {
  name: string;
  unit: string | null;
  price: number;
}): Promise<SaveMaterialResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!suggestPriceAgentEnabledFromEnv() || !isOwnerEmail(user.email)) {
    return { error: "Not available." };
  }

  const mat = normalizeSuggestedMaterial(input);
  if (!mat) return { error: "Need a material name and a price above zero." };

  const { data: existing } = await supabase
    .from("materials")
    .select("id, name")
    .eq("user_id", user.id);
  const match = (existing ?? []).find(
    (m) => m.name.trim().toLowerCase() === mat.name.toLowerCase(),
  );

  if (match) {
    const { error } = await supabase
      .from("materials")
      .update({
        unit: mat.unit,
        default_unit_price: mat.default_unit_price,
        is_ai_estimated: false,
        price_source: "user_library",
        notes: "Saved from a price suggestion.",
      })
      .eq("id", match.id)
      .eq("user_id", user.id);
    if (error) {
      console.error("saveSuggestedMaterial update failed", error);
      return { error: "Could not save to library." };
    }
  } else {
    const { error } = await supabase.from("materials").insert({
      user_id: user.id,
      name: mat.name,
      unit: mat.unit,
      default_unit_price: mat.default_unit_price,
      is_ai_estimated: false,
      price_source: "user_library",
      price_confidence: "high",
      gst_included: false,
      notes: "Saved from a price suggestion.",
    });
    if (error) {
      console.error("saveSuggestedMaterial insert failed", error);
      return { error: "Could not save to library." };
    }
  }

  // Tradie Brain (v1, observe-only) — accepting a suggested price is a strong
  // "this is my price for X" signal. Owner-only + soft-failing.
  await ingestFromAcceptedPrice(supabase, user, {
    name: mat.name,
    unit: mat.unit,
    price: mat.default_unit_price,
  });

  revalidatePath("/app/materials");
  return { ok: true };
}

/* -------------------------------------------------------------------------
 * Wave 13 — Lifecycle transition server actions.
 *
 * Each action delegates the actual UPDATE + quote_events INSERT to the
 * Postgres RPC `public.transition_quote_lifecycle`, which performs both
 * inside a single transaction. That guarantees an audit row is written
 * for every status change without a 2-statement race window.
 *
 * Pre-flight checks before the RPC call:
 *   1. `auth.getUser()` — must be signed in.
 *   2. Load the current quote (RLS-scoped to this owner).
 *   3. Validate the transition is allowed via `canTransition()`.
 *
 * If the TS check passes but the RPC rejects (concurrent transition,
 * drift between TS + DB matrix, etc.), the error is bubbled back with
 * the original Postgres sqlstate so the LifecycleCard can render a
 * meaningful message.
 *
 * No background side-effects. No email send. No PDF generation. No
 * automation. Pure owner-driven state change + audit log. Wave 14 will
 * layer optional email-on-send on top of `sendQuote`.
 * ------------------------------------------------------------------------- */

export type LifecycleResult =
  | { ok: true; status: QuoteStatus }
  | { error: string; code?: string };

interface PostgresErrorShape {
  code?: string;
  message?: string;
}

/** Map Postgres error codes raised by the RPC to plain-English messages. */
function explainRpcError(err: unknown): { error: string; code?: string } {
  const e = (err ?? {}) as PostgresErrorShape;
  const code = e.code;
  if (code === "28000") return { error: "You need to sign in to do that.", code };
  if (code === "P0002") return { error: "Quote not found.", code };
  if (code === "42501") return { error: "You don't own this quote.", code };
  if (code === "22023")
    return {
      error: "That status change isn't allowed from the current state.",
      code,
    };
  return {
    error: e.message ?? "Could not update the quote's lifecycle stage.",
    code,
  };
}

/**
 * Core transition helper. Validates the move TS-side, calls the RPC,
 * and revalidates the affected pages. Every public action below is a
 * thin wrapper around this.
 */
async function transition(
  quoteId: string,
  target: QuoteStatus,
): Promise<LifecycleResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Pre-flight: read current status so we can give a useful error
  // BEFORE round-tripping to the RPC. RLS keeps this scoped to the
  // owner's own quotes.
  const { data: row, error: loadErr } = await supabase
    .from("quotes")
    .select("status")
    .eq("id", quoteId)
    .single();
  if (loadErr || !row) {
    return { error: "Quote not found.", code: "P0002" };
  }
  const current = (row.status ?? "draft") as QuoteStatus;
  if (!canTransition(current, target)) {
    return {
      error: `Cannot move a ${current} quote to ${target}.`,
      code: "22023",
    };
  }

  // The RPC does: row-lock → re-check ownership → re-check matrix →
  // UPDATE quotes (status + matching first-time timestamp) → INSERT
  // quote_events. Single transaction.
  const { data: newStatus, error: rpcErr } = await supabase.rpc(
    "transition_quote_lifecycle",
    {
      p_quote_id: quoteId,
      p_target: target,
      p_metadata: { source: "lifecycle_card" },
    },
  );
  if (rpcErr) {
    console.error("transition_quote_lifecycle RPC failed", rpcErr);
    captureError(rpcErr, { route: "action:transitionQuoteLifecycle" });
    return explainRpcError(rpcErr);
  }

  revalidatePath(`/app/quotes/preview/${quoteId}`);
  revalidatePath("/app/quotes");
  revalidatePath("/app");
  return { ok: true, status: (newStatus as QuoteStatus) ?? target };
}

export async function sendQuote(quoteId: string): Promise<LifecycleResult> {
  // Hard safety gate: a quote with an uncalculable (blocked) line or a
  // failed evaluator verdict can never be marked sent — by ANY path. This
  // mirrors the gate in the email/SMS routes so the lifecycle "Send"
  // button can't be used to slip a broken takeoff past the artifact send.
  // Caution-level warnings are intentionally NOT blocked here — the
  // customer-facing email/SMS send owns the explicit acknowledgement flow.
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("quotes")
    .select("quote_data")
    .eq("id", quoteId)
    .single();
  const qd = (row?.quote_data ?? null) as QuoteData | null;
  const safety = assessQuoteTakeoffSafety(qd);
  if (!safety.can_send) {
    return {
      error: `Can't send — fix the flagged takeoff first: ${safety.block_reasons.join(" ")}`,
      code: "22023",
    };
  }
  return transition(quoteId, "sent");
}

export async function acceptQuote(quoteId: string): Promise<LifecycleResult> {
  return transition(quoteId, "accepted");
}

export async function declineQuote(quoteId: string): Promise<LifecycleResult> {
  return transition(quoteId, "declined");
}

export async function scheduleJob(
  quoteId: string,
  scheduledFor?: string,
): Promise<LifecycleResult> {
  const res = await transition(quoteId, "scheduled");
  // Persist the chosen job date alongside the status change. The
  // transition RPC only flips status + writes the audit row; the actual
  // calendar date lives in quotes.scheduled_for. Best-effort: a failed
  // date write must never undo a successful schedule transition.
  if ("ok" in res && scheduledFor) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { error } = await supabase
        .from("quotes")
        .update({ scheduled_for: scheduledFor })
        .eq("id", quoteId)
        .eq("user_id", user.id);
      if (error) {
        console.error("scheduleJob scheduled_for write failed", error);
        captureError(error, { route: "action:scheduleJob" });
      }
      revalidatePath(`/app/quotes/preview/${quoteId}`);
      revalidatePath("/app");
    }
  }
  return res;
}

export async function markInProgress(
  quoteId: string,
): Promise<LifecycleResult> {
  return transition(quoteId, "in_progress");
}

export async function markComplete(quoteId: string): Promise<LifecycleResult> {
  return transition(quoteId, "completed");
}

/* -------------------------------------------------------------------------
 * Wave 14 — Invoice draft creation.
 *
 * Single call to the `create_invoice_from_quote(uuid)` Postgres RPC.
 * The RPC is the ONLY path that inserts into public.invoices:
 *   - `authenticated` has no INSERT grant on the table
 *   - no `invoices_insert_own` RLS policy exists
 *   - the RPC is SECURITY DEFINER and runs as postgres (superuser),
 *     bypassing both restrictions while enforcing its own checks:
 *       * caller is authenticated
 *       * caller owns the quote
 *       * quote.status = 'completed'
 *       * no non-cancelled invoice already exists for the quote
 *
 * No PDF generation, no email send, no payment flow in this action.
 * The draft row lives in public.invoices and surfaces in the UI via
 * <InvoiceDraftCard>.
 * ------------------------------------------------------------------------- */

export type InvoiceCreateResult =
  | { ok: true; id: string }
  | { error: string; code?: string };

interface PostgresErrorShape {
  code?: string;
  message?: string;
}

function explainInvoiceRpcError(err: unknown): {
  error: string;
  code?: string;
} {
  const e = (err ?? {}) as PostgresErrorShape;
  const code = e.code;
  if (code === "28000")
    return { error: "You need to sign in to do that.", code };
  if (code === "P0002") return { error: "Quote not found.", code };
  if (code === "42501")
    return { error: "You don't own this quote.", code };
  if (code === "22023")
    return {
      error:
        "Mark the quote complete before invoicing — only completed quotes can become invoices.",
      code,
    };
  return {
    error: e.message ?? "Could not create the invoice draft.",
    code,
  };
}

export async function createInvoiceFromQuote(
  quoteId: string,
): Promise<InvoiceCreateResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Correlate the three Invoice Agent events (rpc.start → rpc.success
  // or rpc.failed) with a single run id. Random hex so two parallel
  // calls from the same quote don't collide.
  const runId = `inv_${quoteId}_${Math.random().toString(16).slice(2, 10)}`;
  const startedAt = Date.now();

  logAgentEvent({
    agentName: "Invoice Agent",
    quoteId,
    runId,
    stepName: "rpc.start",
    status: "running",
    message: "create_invoice_from_quote RPC started (Draft only)",
    startedAt,
  });

  const { data, error } = await supabase.rpc("create_invoice_from_quote", {
    p_quote_id: quoteId,
  });

  if (error) {
    console.error("create_invoice_from_quote RPC failed", error);
    captureError(error, { route: "action:createInvoiceFromQuote" });
    logAgentError({
      agentName: "Invoice Agent",
      quoteId,
      runId,
      stepName: "rpc.failed",
      status: "failed",
      message:
        (error as { code?: string; message?: string }).message ??
        "create_invoice_from_quote RPC error",
      durationMs: Date.now() - startedAt,
    });
    return explainInvoiceRpcError(error);
  }

  // Cache invalidation so the InvoiceDraftCard flips from "preview"
  // to "existing" on the next render.
  revalidatePath(`/app/quotes/preview/${quoteId}`);
  revalidatePath("/app/quotes");
  revalidatePath("/app");

  logAgentEvent({
    agentName: "Invoice Agent",
    quoteId,
    runId,
    stepName: "rpc.success",
    status: "complete",
    message: "Draft invoice created (Draft only — not sent, not billed)",
    durationMs: Date.now() - startedAt,
  });

  return { ok: true, id: data as string };
}

/* -------------------------------------------------------------------------
 * Mark invoice paid.
 *
 * Flips invoices.status → 'paid' and stamps paid_at = now. Scoped to
 * the caller's own invoices via the user-scoped Supabase client + an
 * explicit user_id match — the same defence-in-depth pattern the rest
 * of /app uses (RLS is on, but the explicit eq is what proves intent
 * to a reader of this code).
 * ------------------------------------------------------------------------- */

export type MarkPaidResult =
  | { ok: true; invoice_id: string; paid_at: string }
  | { error: string };

export async function markInvoicePaid(
  invoiceId: string,
): Promise<MarkPaidResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const paidAt = new Date().toISOString();

  // Update via the user-scoped client so RLS enforces ownership and we
  // don't need a service-role bypass for what is fundamentally an
  // owner-initiated state flip. The `eq("user_id")` is belt-and-braces.
  const { data, error } = await supabase
    .from("invoices")
    .update({ status: "paid", paid_at: paidAt })
    .eq("id", invoiceId)
    .eq("user_id", user.id)
    .is("deleted_at", null)
    // Only a live, unpaid invoice can be marked paid. Guards against
    // resurrecting a cancelled invoice or re-stamping paid_at on one
    // that's already paid (a 0-row update → handled as "not payable").
    .neq("status", "cancelled")
    .neq("status", "paid")
    .select("id, quote_id")
    .maybeSingle();

  if (error) {
    console.error("markInvoicePaid failed", error);
    captureError(error, { route: "action:markInvoicePaid" });
    return { error: error.message ?? "Could not mark the invoice paid." };
  }
  if (!data) {
    return { error: "Invoice not found, or it's already paid or cancelled." };
  }

  // Refresh every surface the invoice can appear on so the "paid"
  // pill flips immediately without a manual reload.
  revalidatePath(`/app/quotes/preview/${data.quote_id}`);
  revalidatePath("/app/invoices");
  revalidatePath("/app");

  logAgentEvent({
    agentName: "Invoice Agent",
    quoteId: data.quote_id,
    stepName: "mark_paid",
    status: "complete",
    message: "Invoice marked as paid",
  });

  return { ok: true, invoice_id: data.id, paid_at: paidAt };
}
