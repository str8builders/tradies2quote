import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EDITABLE_QUOTE_STATUSES,
  isQuoteLocked,
  regenerateRefusalMessage,
} from "../lock";
import { OWNER_TRANSITIONS, STAGES } from "../stages";
import type { QuoteStatus } from "@/lib/quote-types";

/** Every stage an accepted quote can move on to, per the lifecycle matrix. */
function acceptedAndLater(): Set<QuoteStatus> {
  const seen = new Set<QuoteStatus>(["accepted"]);
  const queue: QuoteStatus[] = ["accepted"];
  while (queue.length > 0) {
    for (const next of OWNER_TRANSITIONS[queue.shift()!]) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

describe("isQuoteLocked", () => {
  it("locks accepted and every stage after it, not just 'accepted'", () => {
    const later = acceptedAndLater();
    expect([...later].sort()).toEqual(["accepted", "completed", "in_progress", "scheduled"]);
    for (const status of later) expect(isQuoteLocked(status)).toBe(true);
  });

  it("locks billing and unrecognised statuses (fails closed)", () => {
    for (const status of ["invoiced", "paid", "cancelled", "Accepted", "", "anything"]) {
      expect(isQuoteLocked(status)).toBe(true);
    }
  });

  it("keeps revisable offers editable, including a missing status (draft)", () => {
    for (const status of ["draft", "sent", "viewed", "declined", "expired", null, undefined]) {
      expect(isQuoteLocked(status)).toBe(false);
    }
  });

  it("covers every lifecycle stage one way or the other", () => {
    const locked = STAGES.filter((s) => isQuoteLocked(s));
    const editable = STAGES.filter((s) => !isQuoteLocked(s));
    expect(new Set([...locked, ...editable])).toEqual(new Set(STAGES));
    expect(editable).toEqual([...EDITABLE_QUOTE_STATUSES]);
  });

  it("matches the database trigger's editable list", () => {
    const sql = readFileSync(
      resolve(__dirname, "../../../../supabase/migrations/20260924_quote_lock_version_accept_guards.sql"),
      "utf8",
    );
    const match = sql.match(/editable constant text\[\] := array\[([^\]]+)\]/);
    expect(match).not.toBeNull();
    const dbList = match![1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
    expect(dbList).toEqual([...EDITABLE_QUOTE_STATUSES]);
  });
});

describe("regenerateRefusalMessage", () => {
  it("explains the lock for accepted-or-later quotes", () => {
    for (const status of ["accepted", "scheduled", "in_progress", "completed"]) {
      expect(regenerateRefusalMessage(status)).toMatch(/accepted.*locked/);
    }
  });
  it("points sent quotes at editing instead", () => {
    expect(regenerateRefusalMessage("sent")).toMatch(/Only draft quotes can be regenerated/);
  });
});
