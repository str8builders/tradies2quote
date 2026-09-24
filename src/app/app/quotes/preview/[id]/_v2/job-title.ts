/**
 * The job's name in plain words for the top of the job page ("New kwila deck
 * at 14 Rata St"), and the client's first name for buttons ("Send to Sam").
 * Pure, so the rules are tested without a DOM.
 */

import { isPlaceholderClientName } from "@/lib/quote-defaults";

/** Summaries that say nothing about the job (test drafts, stubs). */
const GENERIC = new Set(["", "job", "quote", "estimate", "example", "test", "draft", "tbc", "tbd"]);

/** Longest title kept whole; longer ones are cut at a word boundary. */
export const JOB_TITLE_MAX = 48;

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const lastSpace = slice.lastIndexOf(" ");
  return `${(lastSpace > max / 2 ? slice.slice(0, lastSpace) : slice).replace(/[\s,;:–—-]+$/, "")}…`;
}

/**
 * The first plain phrase of the job summary: up to the first sentence end,
 * dash or semicolon ("Kitchen reno — rip out…" → "Kitchen reno"). A decimal
 * point inside a size ("5.4 m") is not a sentence end.
 */
export function summaryTitle(summary: string | null | undefined): string | null {
  const text = (summary ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  const firstSentence = text.split(/(?<!\d)[.!?](?=\s|$)|\s[–—-]\s|;|\n/)[0] ?? "";
  const phrase = firstSentence.replace(/[\s.,;:!?–—-]+$/, "").trim();
  if (GENERIC.has(phrase.toLowerCase())) return null;
  return sentenceCase(cutAtWord(phrase, JOB_TITLE_MAX));
}

/** A real client name, or null for blanks and "To be confirmed" placeholders. */
export function realClientName(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim();
  return trimmed && !isPlaceholderClientName(trimmed) ? trimmed : null;
}

/** "Sam" from "Sam Taylor"; null when there is no real name. */
export function clientFirstName(name: string | null | undefined): string | null {
  const real = realClientName(name);
  return real ? (real.split(/\s+/)[0] ?? null) : null;
}

export interface JobHeading {
  title: string;
  subtitle: string | null;
}

/**
 * Title: the job from its summary, else the client, else the quote number.
 * Subtitle: the client under a job title, the quote number otherwise.
 */
export function jobHeading({
  summary,
  clientName,
  quoteNumber,
}: {
  summary: string | null | undefined;
  clientName: string | null | undefined;
  quoteNumber: string;
}): JobHeading {
  const job = summaryTitle(summary);
  const client = realClientName(clientName);
  if (job) return { title: job, subtitle: client };
  if (client) return { title: client, subtitle: `Quote ${quoteNumber}` };
  return { title: `Quote ${quoteNumber}`, subtitle: null };
}
