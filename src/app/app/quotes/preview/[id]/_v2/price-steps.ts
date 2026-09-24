/**
 * The price keypad: walk through every line that would quote at $0, one at a
 * time ("What do you pay for this? 1 of 3"). Pure stepping and money maths,
 * tested in node; the sheet only renders it.
 */

import { padValueToNumber } from "@/components/ui/lib/number-input";
import { round2 } from "@/lib/quote-defaults";
import type { QuoteLineItem } from "@/lib/quote-types";
import { unpricedIndexes, updateLine } from "./lines";

export interface PriceSession {
  /** Line indexes to price, in order. */
  queue: number[];
  /** Position in the queue. */
  at: number;
  saved: number;
  skipped: number;
  /** Saved prices that also went into the material library. */
  remembered: number;
}

/**
 * Every unpriced line, starting from `startAt` when the tradie tapped a
 * particular one, then the rest in page order.
 */
export function startPriceSession(lines: readonly QuoteLineItem[], startAt?: number): PriceSession {
  const all = unpricedIndexes(lines);
  const queue =
    startAt !== undefined && all.includes(startAt) ? [startAt, ...all.filter((i) => i !== startAt)] : all;
  return { queue, at: 0, saved: 0, skipped: 0, remembered: 0 };
}

export interface PriceStep {
  /** Index of the line in quote_data.line_items. */
  index: number;
  /** 1-based, for "1 of 3". */
  number: number;
  count: number;
  last: boolean;
}

export function currentPriceStep(session: PriceSession): PriceStep | null {
  const index = session.queue[session.at];
  if (index === undefined) return null;
  return { index, number: session.at + 1, count: session.queue.length, last: session.at >= session.queue.length - 1 };
}

export function advancePriceSession(
  session: PriceSession,
  outcome: "saved" | "skipped",
  remembered = false,
): PriceSession {
  const saved = outcome === "saved";
  return {
    ...session,
    at: session.at + 1,
    saved: session.saved + (saved ? 1 : 0),
    skipped: session.skipped + (saved ? 0 : 1),
    remembered: session.remembered + (saved && remembered ? 1 : 0),
  };
}

export function priceSessionDone(session: PriceSession): boolean {
  return session.at >= session.queue.length;
}

/** The typed price as a number, or null until there is a price above zero. */
export function typedPrice(typed: string): number | null {
  const n = padValueToNumber(typed);
  return n !== null && n > 0 ? n : null;
}

/** The live "× qty = line total", rounded to the cent like every saved line. */
export function previewLineTotal(quantity: number, typed: string): number | null {
  const price = typedPrice(typed);
  return price === null ? null : round2((Number(quantity) || 0) * price);
}

/** The lines with one line priced, through the classic edit rules. */
export function applyPrice(lines: readonly QuoteLineItem[], index: number, price: number): QuoteLineItem[] {
  return lines.map((line, i) => (i === index ? updateLine(line, { unit_price: price }) : line));
}

/** Materials are bought; labour and other lines are charged. */
export function priceQuestion(line: QuoteLineItem): string {
  return line.type === "material" ? "What do you pay for this?" : "What do you charge for this?";
}

/** "Price each", "Price per length". */
export function priceUnitLabel(unit: string | null | undefined): string {
  const u = (unit ?? "").trim();
  if (!u || u.toLowerCase() === "each" || u.toLowerCase() === "ea") return "Price each";
  return `Price per ${u}`;
}

/** Only material prices go into the library, so only they offer "Remember". */
export function canRemember(line: QuoteLineItem): boolean {
  return line.type === "material";
}

/**
 * Whether this save teaches the library: a material follows the switch;
 * labour and other lines never reach the library, so their save keeps the
 * classic default.
 */
export function learnForPrice(line: QuoteLineItem, remember: boolean): boolean {
  return canRemember(line) ? remember : true;
}

/** saveQuoteChanges' options for a save: none (the default) unless learning is off. */
export function saveOptionsFor(learn: boolean): { learnMaterials: false } | undefined {
  return learn ? undefined : { learnMaterials: false };
}

/** The toast after the last step. */
export function priceSessionMessage(session: PriceSession): string {
  const { saved, remembered } = session;
  if (saved === 0) return "No prices added";
  const added = `${saved} ${saved === 1 ? "price" : "prices"} added`;
  if (remembered === 0) return added;
  if (remembered === saved) return `${added} and saved for next time`;
  return `${added}, ${remembered} saved for next time`;
}
