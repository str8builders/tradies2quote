import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AgentStat,
  CorrectionItem,
  PriceItem,
  WeeklyDigestData,
} from "./weekly";

// ─────────────────────────────────────────────────────────────────────────
// Weekly digest — data collection (I/O).
//
// Reads ONLY existing tables: `tradie_memories` (what the flywheel learned)
// and `agent_events` (the agent-monitor log). No new schema. Tradie Brain
// ingestion is owner-only today, so every row in `tradie_memories` is the
// owner's — we don't need to resolve a user id. Query failures must reach
// the scheduler; they must not become a misleading empty digest.
// ─────────────────────────────────────────────────────────────────────────

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

export async function collectWeeklyDigest(
  admin: SupabaseClient,
  opts: { windowDays?: number; now?: Date } = {},
): Promise<WeeklyDigestData> {
  const windowDays = opts.windowDays ?? 7;
  const now = opts.now ?? new Date();
  const sinceIso = new Date(now.getTime() - windowDays * 86_400_000).toISOString();


  try {
    const [totalRes, newRes, corrRes, priceRes, eventRes] = await Promise.all([
      admin
        .from("tradie_memories")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
      admin
        .from("tradie_memories")
        .select("id", { count: "exact", head: true })
        .eq("status", "active")
        .gte("created_at", sinceIso),
      admin
        .from("tradie_memories")
        .select("memory_key, value, provenance, strength")
        .eq("status", "active")
        .eq("memory_type", "repeated_correction")
        .order("strength", { ascending: false })
        .limit(5),
      admin
        .from("tradie_memories")
        .select("memory_key, value, strength")
        .eq("status", "active")
        .in("memory_type", ["preferred_material", "pricing_habit"])
        .order("strength", { ascending: false })
        .limit(5),
      admin
        .from("agent_events")
        .select("agent_name, event_type, status")
        .eq("event_type", "run.finish")
        .gte("created_at", sinceIso)
        .limit(2000),
    ]);

    for (const result of [totalRes, newRes, corrRes, priceRes, eventRes]) {
      if (result.error) throw result.error;
    }

    const topCorrections: CorrectionItem[] = (corrRes.data ?? []).map((r) => {
      const value = (r.value ?? {}) as Record<string, unknown>;
      const prov = (r.provenance ?? {}) as Record<string, unknown>;
      return {
        field: str(value.field) || "unit_price",
        description: str(value.description) || str(r.memory_key),
        from: str(value.from ?? prov.before),
        to: str(value.to ?? prov.after),
      };
    });

    const topPrices: PriceItem[] = (priceRes.data ?? [])
      .map((r) => {
        const value = (r.value ?? {}) as Record<string, unknown>;
        const price = num(value.unit_price) ?? num(value.price) ?? num(value.amount);
        if (price == null) return null;
        return {
          material: str(r.memory_key),
          price,
          unit: typeof value.unit === "string" ? value.unit : null,
        } as PriceItem;
      })
      .filter((p): p is PriceItem => p !== null);

    // Group agent run.finish events by agent → total + failed.
    const byAgent = new Map<string, { total: number; failed: number }>();
    for (const e of eventRes.data ?? []) {
      const name = str((e as { agent_name?: unknown }).agent_name) || "Unknown";
      const status = str((e as { status?: unknown }).status);
      const cur = byAgent.get(name) ?? { total: 0, failed: 0 };
      cur.total += 1;
      if (status === "failed") cur.failed += 1;
      byAgent.set(name, cur);
    }
    const agentStats: AgentStat[] = [...byAgent.entries()]
      .map(([name, s]) => ({ name, total: s.total, failed: s.failed }))
      .sort((a, b) => b.total - a.total);

    return {
      windowDays,
      memoriesTotal: totalRes.count ?? 0,
      memoriesNewThisWeek: newRes.count ?? 0,
      topCorrections,
      topPrices,
      agentStats,
    };
  } catch (e) {
    console.warn("[weekly-digest] collect failed", e);
    throw e;
  }
}
