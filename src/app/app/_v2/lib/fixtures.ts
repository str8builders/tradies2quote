/**
 * Test fixtures for the new-look board (made-up jobs; no real customers).
 * Plain data only, so tests can import it anywhere.
 */

import type { BoardInvoice, BoardQuote } from "./job-board";
import type { BoardRequest } from "./home-todos";

/** 10 am, Friday 25 September 2026 in Tauranga (NZST, UTC+12). */
export const NOW = new Date("2026-09-24T22:00:00.000Z");
export const NZ = "Pacific/Auckland";

/** An instant `days` before NOW. */
export function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

let seq = 0;

export function quote(over: Partial<BoardQuote> = {}): BoardQuote {
  seq += 1;
  return {
    id: over.id ?? `q-${seq}`,
    status: "draft",
    total: 1000,
    currency: "NZD",
    clientName: "Sam Taylor",
    jobSummary: "Deck at 14 Rata St",
    createdAt: daysAgo(10),
    sentAt: null,
    viewedAt: null,
    acceptedAt: null,
    scheduledFor: null,
    startedAt: null,
    completedAt: null,
    archived: false,
    ...over,
  };
}

export function invoice(quoteId: string, over: Partial<BoardInvoice> = {}): BoardInvoice {
  seq += 1;
  return {
    id: over.id ?? `inv-${seq}`,
    quoteId,
    number: `INV-${seq}`,
    status: "draft",
    total: 1150,
    currency: "NZD",
    dueDate: daysAgo(-7),
    createdAt: daysAgo(3),
    sentAt: null,
    paidAt: null,
    ...over,
  };
}

export function request(over: Partial<BoardRequest> = {}): BoardRequest {
  seq += 1;
  return {
    id: over.id ?? `r-${seq}`,
    quoteId: null,
    clientName: "Aroha Ngata",
    description: "Bathroom reline, about 6 sheets of aqualine",
    status: "generated",
    createdAt: daysAgo(1),
    ...over,
  };
}

/** A signed-in top bar for render tests: a first name, no photo. */
export const TOP_BAR_FIXTURE = {
  greeting: "Good morning",
  today: "Friday 25 September",
  name: "Sam",
  letter: "S",
  avatarUrl: null,
  email: "sam@example.test",
  businessName: "Sam's Building",
  outdoor: false,
  t2qcal: true,
  isOwner: false,
  canChooseLook: false,
} as const satisfies import("./top-bar").TopBarData;
