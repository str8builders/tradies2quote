import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { PublicLineItem, PublicQuotePayload } from "@/lib/quote-types";

/**
 * Privacy contract for `quote_data.verification` (audit 2026-09-24, item 7).
 * The verification report is tradie-facing review evidence — it must never
 * reach the public /quote/[token] page. Same layered proof as the transcript
 * and compliance payloads: the public types have no such key, and the live
 * `get_quote_by_token` RPC projects an explicit field list that never
 * includes it (nor quote_data wholesale).
 */

describe("quote_data.verification never reaches the public quote", () => {
  it("type-level: no verification key on the public payload or its lines", () => {
    expectTypeOf<"verification" & keyof PublicQuotePayload>().toEqualTypeOf<never>();
    expectTypeOf<"verification" & keyof PublicLineItem>().toEqualTypeOf<never>();
  });

  it("the latest get_quote_by_token definition projects explicit fields only", () => {
    const dir = join(process.cwd(), "supabase", "migrations");
    const defining = readdirSync(dir)
      .filter((f) => f.endsWith(".sql") && !f.startsWith("rollback"))
      .sort()
      .filter((f) =>
        /create\s+or\s+replace\s+function\s+public\.get_quote_by_token/i.test(
          readFileSync(join(dir, f), "utf8"),
        ),
      );
    expect(defining.length).toBeGreaterThan(0);
    const sql = readFileSync(join(dir, defining[defining.length - 1]), "utf8");
    const start = sql.search(/create\s+or\s+replace\s+function\s+public\.get_quote_by_token/i);
    const body = sql.slice(start, sql.indexOf("$$;", start));
    expect(body).toMatch(/jsonb_build_object\(/);
    expect(body).not.toMatch(/verification/i);
    // quote_data is only ever read field-by-field (->, ->>, #>>), never
    // returned whole or merged into the payload.
    expect(body).not.toMatch(/q\.quote_data\s*(?:\|\||,|\))/);
  });
});
