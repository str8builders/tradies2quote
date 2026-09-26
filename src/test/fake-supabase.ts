/**
 * Minimal chainable stand-in for a Supabase client's `from()` builder, for
 * route/action unit tests. Every finished query is recorded in `ops` and
 * answered by the test's `respond` callback, so a test can both script the
 * database and assert exactly which writes (with which filters) were made.
 * Never talks to a network.
 */
export type FakeOp = {
  table: string;
  action: "select" | "update" | "insert" | "upsert" | "delete";
  columns?: string;
  values?: unknown;
  filters: Array<[method: string, column: string, value: unknown]>;
  terminal: "single" | "maybeSingle" | "await";
};

export type FakeResult = { data?: unknown; error?: unknown } | undefined | void;

export function fakeSupabase(respond: (op: FakeOp) => FakeResult) {
  const ops: FakeOp[] = [];
  function from(table: string) {
    const op: FakeOp = { table, action: "select", filters: [], terminal: "await" };
    const finish = (terminal: FakeOp["terminal"]) => {
      op.terminal = terminal;
      ops.push(op);
      const result = respond(op) ?? {};
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
    };
    const filter = (method: string) => (column: string, value?: unknown) => {
      op.filters.push([method, column, value]);
      return builder;
    };
    const builder = {
      select: (columns?: string) => {
        if (op.action === "select") op.columns = columns;
        return builder;
      },
      update: (values: unknown) => Object.assign(op, { action: "update", values }) && builder,
      insert: (values: unknown) => Object.assign(op, { action: "insert", values }) && builder,
      upsert: (values: unknown) => Object.assign(op, { action: "upsert", values }) && builder,
      delete: () => Object.assign(op, { action: "delete" }) && builder,
      eq: filter("eq"),
      neq: filter("neq"),
      is: filter("is"),
      in: filter("in"),
      gte: filter("gte"),
      lt: filter("lt"),
      not: filter("not"),
      order: () => builder,
      limit: () => builder,
      range: () => builder,
      single: () => finish("single"),
      maybeSingle: () => finish("maybeSingle"),
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
        finish("await").then(resolve, reject),
    };
    return builder;
  }
  /** Value of the first `eq` filter on `column`, if any. */
  const eqValue = (op: FakeOp, column: string) =>
    op.filters.find(([method, name]) => method === "eq" && name === column)?.[2];
  return { ops, from, eqValue };
}
