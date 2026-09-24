import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A read-only stand-in for the Supabase query builder, for the new-look
 * board tests (Home, Jobs). Records every query — table, columns, options
 * and filters — and answers from a per-table script. Never talks to a
 * network. (src/test/fake-supabase.ts is the write-oriented sibling.)
 */

export interface BoardDbQuery {
  table: string;
  columns: string;
  options?: { count?: string; head?: boolean };
  filters: Array<[method: string, column: string, value: unknown]>;
  order?: [column: string, options: unknown];
  limit?: number;
  terminal: "await" | "maybeSingle";
}

export interface BoardDbAnswer {
  data?: unknown;
  error?: unknown;
  count?: number | null;
}

export function fakeBoardDb(answers: Record<string, BoardDbAnswer | ((q: BoardDbQuery) => BoardDbAnswer)>) {
  const queries: BoardDbQuery[] = [];
  function from(table: string) {
    const query: BoardDbQuery = { table, columns: "", filters: [], terminal: "await" };
    const finish = (terminal: BoardDbQuery["terminal"]) => {
      query.terminal = terminal;
      queries.push(query);
      const script = answers[table];
      const answer = (typeof script === "function" ? script(query) : script) ?? {};
      return Promise.resolve({
        data: answer.data ?? null,
        error: answer.error ?? null,
        count: answer.count ?? null,
      });
    };
    const filter = (method: string) => (column: string, value?: unknown) => {
      query.filters.push([method, column, value]);
      return builder;
    };
    const builder = {
      select: (columns: string, options?: BoardDbQuery["options"]) => {
        query.columns = columns;
        query.options = options;
        return builder;
      },
      eq: filter("eq"),
      neq: filter("neq"),
      is: filter("is"),
      in: filter("in"),
      gt: filter("gt"),
      order: (column: string, options?: unknown) => {
        query.order = [column, options];
        return builder;
      },
      limit: (n: number) => {
        query.limit = n;
        return builder;
      },
      maybeSingle: () => finish("maybeSingle"),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        finish("await").then(resolve, reject),
    };
    return builder;
  }
  // Typed as the real client's `from` so it can be passed where the code
  // under test expects `Pick<SupabaseClient, "from">`.
  return { from: from as unknown as SupabaseClient["from"], queries };
}
