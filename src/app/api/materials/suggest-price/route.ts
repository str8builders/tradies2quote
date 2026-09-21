import { aiConsentGate } from "@/lib/ai-consent";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/owner";
import type { LibraryMaterial, QuoteData } from "@/lib/quote-types";
import {
  suggestPrice,
  suggestPriceAgentEnabledFromEnv,
  type HistoryLine,
  type SuggestPriceTargetLine,
} from "@/lib/agents/suggestPrice";
import { tradieBrainEnabledFromEnv } from "@/lib/tradieBrain";
import { getRelevantMemories } from "@/lib/tradieBrain/retrieve";
import { formatMemoriesForPrompt } from "@/lib/tradieBrain/format";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";
import { isLocalTextAiProvider } from "@/lib/llm/local-chat";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// One short LLM call at most (and often none — the deterministic paths skip
// it). Keep headroom but well under the generate route's budget.
export const maxDuration = 1800;

/**
 * Owner-only + flag-gated "Suggest a Price" agent endpoint (beta).
 *
 * ADVISORY ONLY. Reads the owner's own materials library + recent quote
 * lines, returns a price SUGGESTION. Writes nothing — applying a suggestion
 * is a separate, explicit human action in the editor. Hidden (404) when the
 * flag is off or the caller isn't the owner, so the route's existence isn't
 * advertised during the owner-only beta.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const consentGate = await aiConsentGate(supabase, user.id);
  if (consentGate) return consentGate;
  if (!suggestPriceAgentEnabledFromEnv() || !isOwnerEmail(user.email)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Defence-in-depth: owner-only already, but a leaked session/XSS
  // shouldn't be able to burn unbounded LLM credit either.
  const quota = consumeDailyQuota("suggest-price:" + user.id, 200);
  if (!quota.ok) return tooManyRequestsResponse(quota.resetAt);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  if (!description) {
    return NextResponse.json({ error: "Missing 'description'" }, { status: 400 });
  }
  const target: SuggestPriceTargetLine = {
    description,
    quantity: Number(body.quantity) || 0,
    unit: typeof body.unit === "string" && body.unit.trim() ? body.unit.trim() : null,
    trade_scope: typeof body.trade_scope === "string" ? body.trade_scope : null,
    job_type: typeof body.job_type === "string" ? body.job_type : null,
    supplier_hint:
      typeof body.supplier_hint === "string" ? body.supplier_hint : null,
  };

  // The library already consolidates corrected + supplier-import prices.
  const { data: libraryRows } = await supabase
    .from("materials")
    .select(
      "id, name, unit, default_unit_price, supplier, supplier_url, notes, usage_count, is_ai_estimated, last_used_at",
    )
    .eq("user_id", user.id)
    .order("usage_count", { ascending: false })
    .order("name", { ascending: true })
    .limit(400);
  const library: LibraryMaterial[] = (libraryRows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    unit: r.unit,
    default_unit_price:
      r.default_unit_price !== null ? Number(r.default_unit_price) : null,
    supplier: r.supplier,
    supplier_url: r.supplier_url,
    notes: r.notes,
    usage_count: Number(r.usage_count) || 0,
    is_ai_estimated: !!r.is_ai_estimated,
    last_used_at: r.last_used_at,
  }));

  // Recent priced material lines from the owner's own quotes — patterns that
  // may not be in the library yet. Deduped by description.
  const { data: quoteRows } = await supabase
    .from("quotes")
    .select("quote_data")
    .eq("user_id", user.id)
    .not("quote_data", "is", null)
    .order("created_at", { ascending: false })
    .limit(20);
  const seen = new Set<string>();
  const history: HistoryLine[] = [];
  for (const row of quoteRows ?? []) {
    const qd = (row.quote_data ?? null) as QuoteData | null;
    const items = Array.isArray(qd?.line_items) ? qd!.line_items : [];
    for (const it of items) {
      if (it.type !== "material") continue;
      const price = Number(it.unit_price) || 0;
      const name = (it.description ?? "").trim();
      if (!name || price <= 0) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      history.push({
        source: "quote_history",
        material_id: it.library_id ?? null,
        name,
        unit: it.unit ?? null,
        unit_price: price,
        supplier: null,
      });
      if (history.length >= 40) break;
    }
    if (history.length >= 40) break;
  }

  // Tradie Brain consumption (Chunk 4) — only when TRADIE_BRAIN_ENABLED is on
  // (separate from the suggest-price flag). Adds the tradie's own past
  // patterns as ADVISORY context to the LLM branch; never overrides the
  // deterministic short-circuits or the strict output parser. Soft-failing:
  // a memory hiccup must never break the suggestion.
  let memoryContext: string | undefined;
  if (tradieBrainEnabledFromEnv()) {
    try {
      const memories = await getRelevantMemories(
        supabase,
        user.id,
        {
          surface: "material_price_suggestion",
          materialDescriptions: [description],
          jobType: target.job_type,
          limit: 6,
        },
        { markUsed: true },
      );
      const block = formatMemoriesForPrompt(memories);
      if (block) memoryContext = block;
    } catch (e) {
      console.warn("[suggest-price] memory retrieval failed (non-fatal)", e);
    }
  }

  const result = await suggestPrice({
    target,
    library,
    history,
    memoryContext,
    apiKey: isLocalTextAiProvider()
      ? (process.env.LOCAL_LLM_API_KEY ?? "")
      : (process.env.ANTHROPIC_API_KEY ?? ""),
  });

  console.log("[suggest-price] result", {
    userId: user.id,
    status: result.recommendation.status,
    confidence: result.recommendation.confidence,
    used_llm: !result.reasoning.evidence_ranked.some(
      (e) => e.note === "exact name + compatible unit",
    ),
  });

  return NextResponse.json(result);
}
