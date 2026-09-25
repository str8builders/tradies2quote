// ─────────────────────────────────────────────────────────────────────────
// Golden jobs — shared types and the exact-number helpers.
//
// A golden job is a realistic NZ job whose every quantity and dollar figure
// was worked out BY HAND from first principles (the working sits next to
// each number). The runner (golden-jobs.test.ts) feeds the job through the
// same functions production uses and demands exact equality:
//
//   count    — an integer (studs, sheets, packs, lengths)
//   decimal  — an exact decimal quantity ("184.8" m of decking, "2.6" m³),
//              compared as scaled integers at the written precision
//   money    — dollars written as a string ("1234.56"), compared as integer
//              CENTS; the code's number must already be a whole number of
//              cents (12.345 fails, it is never silently rounded here)
//   text     — an exact string (e.g. the list of line ids a job emits)
//   bool     — an exact flag
//
// Nothing in this folder calls an AI model or the network.
// ─────────────────────────────────────────────────────────────────────────

export type ExpectedKind = "count" | "decimal" | "money" | "text" | "bool";

export type Expected = {
  kind: ExpectedKind;
  /** count → number, decimal/money → exact decimal string, text → string, bool → boolean. */
  value: number | string | boolean;
  /** The hand working that produced `value`. Shown in every failure message. */
  working: string;
};

export type Actual = number | string | boolean | null | undefined;
export type Actuals = Record<string, Actual>;

export type Trade =
  | "framing"
  | "lining"
  | "insulation"
  | "deck"
  | "subfloor"
  | "cladding"
  | "roofing"
  | "fencing"
  | "concrete"
  | "fixing"
  | "generic"
  | "money";

export type GoldenJob = {
  id: string;
  trade: Trade;
  title: string;
  /** What the tradie said / typed (or the scan transcript), NZ-style. */
  said: string;
  /** Plain summary of the structured inputs the job should resolve to. */
  structured: string;
  /** Every checked figure, keyed. One test per key. */
  expect: Record<string, Expected>;
  /**
   * Keys where the CODE disagrees with the hand-worked expectation and the
   * expectation has been re-checked. Each becomes `it.fails(...)`: green
   * today, red the moment the bug is fixed (the signal to flip it to `it`).
   * Every message starts "KNOWN BUG:".
   */
  knownBugs?: Record<string, string>;
  /** Runs the job through production code and returns the actual figures. */
  compute: () => Actuals;
};

// ── Expectation constructors ─────────────────────────────────────────────

export const count = (value: number, working: string): Expected => {
  if (!Number.isInteger(value)) throw new Error(`count(${value}) must be an integer`);
  return { kind: "count", value, working };
};

export const decimal = (value: string, working: string): Expected => {
  if (!/^-?\d+(\.\d+)?$/.test(value)) throw new Error(`decimal("${value}") must be a plain decimal string`);
  return { kind: "decimal", value, working };
};

export const money = (value: string, working: string): Expected => {
  if (!/^-?\d+\.\d\d$/.test(value)) throw new Error(`money("${value}") must be dollars with exactly two decimals`);
  return { kind: "money", value, working };
};

export const text = (value: string, working: string): Expected => ({ kind: "text", value, working });

export const bool = (value: boolean, working: string): Expected => ({ kind: "bool", value, working });

// ── Exact comparison ─────────────────────────────────────────────────────

/** "1234.56" → 123456 (integer cents) without ever going through a float. */
export function centsOf(dollars: string): number {
  const m = /^(-?)(\d+)\.(\d\d)$/.exec(dollars);
  if (!m) throw new Error(`not a money string: ${dollars}`);
  const cents = Number(m[2]) * 100 + Number(m[3]);
  return m[1] === "-" ? -cents : cents;
}

/** Decimal string → { scaled integer, scale } at the string's own precision. */
function scaledOf(value: string): { int: number; dp: number } {
  const [whole, frac = ""] = value.replace(/^-/, "").split(".");
  const int = Number(whole) * 10 ** frac.length + (frac ? Number(frac) : 0);
  return { int: value.startsWith("-") ? -int : int, dp: frac.length };
}

/**
 * A code number → integer at `dp` decimals, or null when it isn't a whole
 * number of those units (12.345 at dp=2). The 1e-6 window only absorbs
 * binary representation noise (0.1 + 0.2), never a real extra decimal.
 */
function scaledActual(n: number, dp: number): number | null {
  const scaled = n * 10 ** dp;
  const rounded = Math.round(scaled);
  return Math.abs(scaled - rounded) < 1e-6 ? rounded : null;
}

export type Verdict = { ok: true } | { ok: false; message: string };

export function compare(
  jobId: string,
  key: string,
  expected: Expected,
  actual: Actual,
): Verdict {
  const fail = (why: string): Verdict => ({
    ok: false,
    message:
      `${jobId} › ${key}: expected ${expected.kind} ${JSON.stringify(expected.value)} but got ${actual === undefined ? "nothing" : JSON.stringify(actual)}` +
      `${why ? ` (${why})` : ""}\n    working: ${expected.working}`,
  });

  if (actual === undefined) return fail("the code produced no such figure");

  switch (expected.kind) {
    case "count": {
      if (typeof actual !== "number" || !Number.isFinite(actual)) return fail("not a number");
      return actual === expected.value ? { ok: true } : fail("");
    }
    case "decimal": {
      if (typeof actual !== "number" || !Number.isFinite(actual)) return fail("not a number");
      const want = scaledOf(expected.value as string);
      const got = scaledActual(actual, want.dp);
      if (got === null) return fail(`has more than ${want.dp} decimal place(s)`);
      return got === want.int ? { ok: true } : fail("");
    }
    case "money": {
      if (typeof actual !== "number" || !Number.isFinite(actual)) return fail("not a number");
      const got = scaledActual(actual, 2);
      if (got === null) return fail("not a whole number of cents");
      return got === centsOf(expected.value as string) ? { ok: true } : fail(`${got} cents vs ${centsOf(expected.value as string)} cents`);
    }
    case "text":
    case "bool":
      return actual === expected.value ? { ok: true } : fail("");
  }
}
