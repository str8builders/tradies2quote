import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * A tiny in-memory stand-in for the Supabase query builder, enough for the
 * generation lease and the pipeline around it. `quotes` is a real row whose
 * conditional updates evaluate eq / is / lt filters synchronously — the same
 * all-or-nothing semantics Postgres row locking gives the lease — and every
 * write is recorded. Other tables answer with canned data.
 */

type Row = Record<string, unknown>;
type Filter = { op: "eq" | "is" | "lt" | "neq"; col: string; value: unknown };

export interface FakeQuotesDb {
  db: SupabaseClient<Database>;
  quote: Row;
  /** Every update against `quotes`: its payload and filters. */
  quoteUpdates: Array<{ payload: Row; filters: Filter[]; matched: boolean }>;
  inserted: Row[];
  /** Make the next `quotes` update fail with this error message. */
  failNextQuoteUpdate(message: string): void;
}

export function makeFakeQuotesDb(opts: {
  quote: Row;
  profile?: Row;
  library?: Row[];
}): FakeQuotesDb {
  const quote = { ...opts.quote };
  const quoteUpdates: FakeQuotesDb["quoteUpdates"] = [];
  const inserted: Row[] = [];
  let pendingFailure: string | null = null;

  const matches = (filters: Filter[]) =>
    filters.every((f) => {
      const v = quote[f.col];
      if (f.op === "eq") return v === f.value;
      if (f.op === "neq") return v !== f.value;
      if (f.op === "is") return f.value === null ? v === null || v === undefined : v === f.value;
      return v !== null && v !== undefined && String(v) < String(f.value);
    });

  function from(table: string) {
    let op: "select" | "update" | "insert" | "delete" = "select";
    let payload: unknown = null;
    let cols = "";
    let selectAfterWrite = false;
    const filters: Filter[] = [];

    const run = (single: boolean) => {
      if (table === "quotes") {
        if (op === "update") {
          if (pendingFailure) {
            const message = pendingFailure;
            pendingFailure = null;
            quoteUpdates.push({ payload: payload as Row, filters: [...filters], matched: false });
            return { data: null, error: { message } };
          }
          const matched = matches(filters);
          quoteUpdates.push({ payload: payload as Row, filters: [...filters], matched });
          if (matched) Object.assign(quote, payload as Row);
          return { data: selectAfterWrite ? (matched ? [{ id: quote.id }] : []) : null, error: null };
        }
        if (op === "select") {
          const isThisQuote = filters.some((f) => f.op === "eq" && f.col === "id");
          if (isThisQuote) {
            return matches(filters) ? { data: { ...quote }, error: null } : { data: null, error: { message: "no rows" } };
          }
          return { data: [], error: null }; // the "recent quotes" list
        }
        return { data: null, error: null };
      }
      if (op === "insert") {
        inserted.push(...((Array.isArray(payload) ? payload : [payload]) as Row[]));
        return { data: null, error: null };
      }
      if (op !== "select") return { data: null, error: null };
      if (table === "profiles") return { data: opts.profile ?? null, error: null };
      if (table === "materials" && cols.includes("default_unit_price")) {
        return { data: opts.library ?? [], error: null };
      }
      return { data: single ? null : [], error: null };
    };

    const b: Record<string, unknown> = {};
    const chain = () => b;
    const filter = (op2: Filter["op"]) => (col: string, value: unknown) => {
      filters.push({ op: op2, col, value });
      return b;
    };
    Object.assign(b, {
      select: (c?: string) => {
        if (op === "select") cols = c ?? "";
        else selectAfterWrite = true;
        return b;
      },
      update: (p: unknown) => {
        op = "update";
        payload = p;
        return b;
      },
      insert: (p: unknown) => {
        op = "insert";
        payload = p;
        return b;
      },
      delete: () => {
        op = "delete";
        return b;
      },
      eq: filter("eq"),
      neq: filter("neq"),
      is: filter("is"),
      lt: filter("lt"),
      not: chain,
      in: chain,
      order: chain,
      limit: chain,
      single: async () => run(true),
      maybeSingle: async () => run(true),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
        Promise.resolve(run(false)).then(res, rej),
    });
    return b;
  }

  return {
    db: { from } as unknown as SupabaseClient<Database>,
    quote,
    quoteUpdates,
    inserted,
    failNextQuoteUpdate(message) {
      pendingFailure = message;
    },
  };
}
