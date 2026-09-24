/**
 * Made-up jobs and people for the /ui-kit examples. Nothing here is a real
 * customer, and nothing on the kit page reads or writes the database.
 */

import { round2 } from "@/lib/quote-defaults";

export const GST_RATE = 0.15;

export interface ExampleLine {
  id: string;
  title: string;
  /** Quantity in words, as the line card shows it. */
  detail: string;
  qty: number;
  /** "each", "box" … shown after the item name while pricing. */
  unit: string;
  /** Price per unit ex GST; null means the tradie still has to add it. */
  price: number | null;
  /** What the price keypad preview shows already typed. */
  typed?: string;
}

export interface ExampleJob {
  title: string;
  client: string;
  acceptedOn: string;
  lines: ExampleLine[];
}

export const DECK_JOB: ExampleJob = {
  title: "Deck at 14 Rata St",
  client: "Sam Taylor",
  acceptedOn: "Accepted 22 Sep",
  lines: [
    { id: "decking", title: "Decking 140×32 H3.2", detail: "42 lengths × 5.4 m", qty: 42, unit: "length", price: 36 },
    { id: "joists", title: "Joists 190×45 H3.2", detail: "14 lengths × 4.8 m", qty: 14, unit: "length", price: 57.6 },
    { id: "hangers", title: "Joist hangers 190 mm", detail: "28 each", qty: 28, unit: "each", price: null, typed: "3.85" },
    { id: "nails", title: "Galvanised nails 90 mm", detail: "2 boxes", qty: 2, unit: "box", price: null, typed: "42.50" },
    { id: "labour", title: "Labour", detail: "3 days", qty: 3, unit: "day", price: 560 },
  ],
};

/** Total including GST of the lines that have a price. */
export function totalWithGst(lines: ReadonlyArray<Pick<ExampleLine, "qty" | "price">>): number {
  const subtotal = lines.reduce((sum, line) => sum + (line.price === null ? 0 : line.qty * line.price), 0);
  return round2(round2(subtotal) * (1 + GST_RATE));
}

/** The big button on the job page, step by step, and what it confirms. */
export const JOB_STEPS = {
  Booked: { button: "Book the job", toast: "Booked for Tue 30 Sep" },
  Done: { button: "Job done, send invoice", toast: "Invoice sent to Sam Taylor" },
  Paid: { button: "Mark as paid", toast: "Paid. Nice work." },
} as const;

export interface TranscriptWord {
  text: string;
  /** Sizes the app picked up, highlighted as you speak. */
  mark?: boolean;
}

export const TRANSCRIPT: TranscriptWord[] = [
  { text: "New" },
  { text: "deck" },
  { text: "for" },
  { text: "Sam" },
  { text: "Taylor" },
  { text: "at" },
  { text: "14" },
  { text: "Rata" },
  { text: "Street," },
  { text: "5.4 by 4.8", mark: true },
  { text: "metres," },
  { text: "H3.2" },
  { text: "pine," },
  { text: "joists" },
  { text: "at" },
  { text: "450 centres,", mark: true },
  { text: "about" },
  { text: "three" },
  { text: "days" },
  { text: "labour…" },
];
