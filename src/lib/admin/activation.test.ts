import { describe, expect, it } from "vitest";
import { isCompedEmail } from "@/lib/reviewer";
import { isOwnerEmail } from "@/lib/owner";
import {
  STUCK_LIST_LIMIT,
  buildActivation,
  isSentQuote,
  isWonQuote,
  type ActivationProfile,
  type ActivationQuote,
  type ActivationUser,
} from "./activation";

const NOW = new Date("2026-10-03T00:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const iso = (ms: number) => ago(ms).toISOString();
const isInternal = (email: string | null) => isOwnerEmail(email) || isCompedEmail(email);

const user = (id: string, email: string | null, signedUpAgo: number): ActivationUser => ({ id, email, createdAt: ago(signedUpAgo) });
const quote = (userId: string, createdAgo: number, over: Partial<ActivationQuote> = {}): ActivationQuote => ({
  user_id: userId,
  status: "draft",
  created_at: iso(createdAgo),
  sent_at: null,
  accepted_at: null,
  ...over,
});

describe("what counts as sent and won", () => {
  it("sent: a sent_at, or any status after draft", () => {
    expect(isSentQuote({ status: "draft", sent_at: null })).toBe(false);
    expect(isSentQuote({ status: "draft", sent_at: iso(DAY) })).toBe(true);
    for (const status of ["sent", "viewed", "accepted", "declined", "expired", "scheduled", "in_progress", "completed"]) {
      expect(isSentQuote({ status, sent_at: null }), status).toBe(true);
    }
    expect(isSentQuote({ status: null, sent_at: null })).toBe(false);
  });

  it("won: an accepted_at, or an accepted-or-later status; declined and expired are not wins", () => {
    expect(isWonQuote({ status: "sent", accepted_at: null })).toBe(false);
    expect(isWonQuote({ status: "declined", accepted_at: null })).toBe(false);
    expect(isWonQuote({ status: "expired", accepted_at: null })).toBe(false);
    expect(isWonQuote({ status: "sent", accepted_at: iso(DAY) })).toBe(true);
    for (const status of ["accepted", "scheduled", "in_progress", "completed"]) expect(isWonQuote({ status, accepted_at: null }), status).toBe(true);
  });
});

describe("buildActivation", () => {
  const users: ActivationUser[] = [
    user("owner", "challis836@gmail.com", 90 * DAY),
    user("demo", "Demo@Tradies2Quote.com", 60 * DAY),
    user("a", "a@builders.nz", 10 * DAY),
    user("b", "b@sparky.nz", 5 * DAY),
    user("c", "c@plumbing.nz", 3 * DAY),
    user("d", "d@new.nz", 6 * HOUR),
    user("e", "e@old.nz", 20 * DAY),
    user("f", null, 2 * DAY),
    user("h", "h@quick.nz", 2 * DAY),
  ];
  const profiles: ActivationProfile[] = [
    { id: "owner", business_name: "STR8 Builders" },
    { id: "a", business_name: "A Builders" },
    { id: "b", business_name: null },
    { id: "c", business_name: "C Plumbing" },
    { id: "e", business_name: "   " },
  ];
  const quotes: ActivationQuote[] = [
    // The owner's and the demo's quotes never count.
    quote("owner", 30 * DAY, { status: "completed", sent_at: iso(29 * DAY), accepted_at: iso(28 * DAY) }),
    quote("demo", 30 * DAY, { status: "sent", sent_at: iso(29 * DAY) }),
    // A: first quote 12 hours after signing up, one sent, one accepted, the latest yesterday.
    quote("a", 10 * DAY - 12 * HOUR),
    quote("a", 5 * DAY, { status: "sent", sent_at: iso(5 * DAY - HOUR) }),
    quote("a", DAY, { status: "accepted", sent_at: iso(DAY + HOUR), accepted_at: iso(DAY - HOUR) }),
    // B: a single draft, two days after signing up (so 3 days old now), never sent.
    quote("b", 3 * DAY),
    // H: a draft only 3 hours old: not stuck yet.
    quote("h", 3 * HOUR),
    // A quote from someone who is not in the user list is ignored.
    quote("ghost", DAY),
  ];

  const result = buildActivation({ users, profiles, quotes, now: NOW, isInternal });
  const count = (id: string) => result.steps.find((s) => s.id === id)?.count;

  it("leaves out the owner and the review demo, and says how many", () => {
    expect(result.excluded).toBe(2);
    expect(count("signed-up")).toBe(7);
  });

  it("counts each step once per person", () => {
    expect(count("business")).toBe(2); // a and c; "   " is not a name
    expect(count("quote")).toBe(3); // a, b, h
    expect(count("sent")).toBe(1); // a
    expect(count("won")).toBe(1); // a
  });

  it("gives each step's share of everyone who signed up", () => {
    expect(result.steps.map((s) => s.id)).toEqual(["signed-up", "business", "quote", "sent", "won"]);
    expect(result.steps[0].share).toBe(1);
    expect(result.steps.find((s) => s.id === "quote")?.share).toBeCloseTo(3 / 7, 5);
  });

  it("counts people who made a quote this week, and the median wait for a first quote", () => {
    expect(result.activeThisWeek).toBe(3); // a (yesterday), b (3 days ago), h (3 hours ago)
    // a: 12 h, b: 48 h, h: 45 h -> sorted 12, 45, 48 -> 45
    expect(result.medianHoursToFirstQuote).toBe(45);
  });

  it("names who signed up over a day ago and never quoted, longest wait first", () => {
    expect(result.stuckNoQuote).toEqual([
      { email: "e@old.nz", days: 20, quotes: 0 },
      { email: "c@plumbing.nz", days: 3, quotes: 0 },
      { email: "(no email)", days: 2, quotes: 0 },
    ]);
    expect(result.stuckNoQuote.some((p) => p.email === "d@new.nz")).toBe(false); // six hours is not stuck
  });

  it("names who quoted over a day ago and never sent, and not someone whose draft is hours old", () => {
    expect(result.quotedNotSent).toEqual([{ email: "b@sparky.nz", days: 3, quotes: 1 }]);
  });

  it("is a clean section with no error", () => {
    expect(result.error).toBeNull();
  });
});

describe("buildActivation: edges", () => {
  it("no customers: every step is zero, with no NaN", () => {
    const result = buildActivation({ users: [user("owner", "challis836@gmail.com", DAY)], profiles: [], quotes: [], now: NOW, isInternal });
    expect(result.excluded).toBe(1);
    expect(result.steps.every((s) => s.count === 0 && s.share === 0)).toBe(true);
    expect(result.medianHoursToFirstQuote).toBeNull();
    expect(result.activeThisWeek).toBe(0);
  });

  it("a quote only ever sent by status (no sent_at) still counts as sent", () => {
    const result = buildActivation({
      users: [user("a", "a@x.nz", 10 * DAY)],
      profiles: [],
      quotes: [quote("a", 5 * DAY, { status: "viewed" })],
      now: NOW,
      isInternal,
    });
    expect(result.steps.find((s) => s.id === "sent")?.count).toBe(1);
    expect(result.quotedNotSent).toEqual([]);
  });

  it("each 'stopped here' list stops at ten, longest wait first", () => {
    const many = Array.from({ length: 15 }, (_, i) => user(`u${i}`, `u${i}@x.nz`, (i + 2) * DAY));
    const result = buildActivation({ users: many, profiles: [], quotes: [], now: NOW, isInternal });
    expect(result.stuckNoQuote).toHaveLength(STUCK_LIST_LIMIT);
    expect(result.stuckNoQuote[0].days).toBe(16);
    expect(result.stuckNoQuote[9].days).toBe(7);
  });

  it("the median of an even number of people is the middle pair's average", () => {
    const result = buildActivation({
      users: [user("a", "a@x.nz", 10 * DAY), user("b", "b@x.nz", 10 * DAY)],
      profiles: [],
      quotes: [quote("a", 10 * DAY - 2 * HOUR), quote("b", 10 * DAY - 5 * HOUR)],
      now: NOW,
      isInternal,
    });
    expect(result.medianHoursToFirstQuote).toBe(3.5);
  });
});
