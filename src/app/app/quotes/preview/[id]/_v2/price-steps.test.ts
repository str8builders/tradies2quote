import { describe, expect, it } from "vitest";
import { round2 } from "@/lib/quote-defaults";
import type { QuoteLineItem } from "@/lib/quote-types";
import {
  advancePriceSession,
  applyPrice,
  canRemember,
  currentPriceStep,
  previewLineTotal,
  priceQuestion,
  priceSessionDone,
  priceSessionMessage,
  priceUnitLabel,
  startPriceSession,
  typedPrice,
} from "./price-steps";

const line = (patch: Partial<QuoteLineItem> = {}): QuoteLineItem => ({
  type: "material",
  description: "Decking 140x32",
  quantity: 42,
  unit: "length",
  unit_price: 36,
  line_total: 1512,
  ...patch,
});

const lines: QuoteLineItem[] = [
  line(),
  line({ description: "Joist hangers", quantity: 28, unit: "each", unit_price: 0, line_total: 0, is_missing_price: true }),
  line({ type: "labour", description: "Labour", quantity: 3, unit: "day", unit_price: 0, line_total: 0 }),
  line({ description: "Nails", quantity: 2, unit: "box", unit_price: 0, line_total: 0 }),
  line({ description: "Blocked", quantity: 0, unit_price: 0, line_total: 0, takeoff_status: "blocked" }),
];

describe("price keypad stepping", () => {
  it("walks every line that would quote at $0, in page order ('1 of 3')", () => {
    const session = startPriceSession(lines);
    expect(session.queue).toEqual([1, 2, 3]);
    expect(currentPriceStep(session)).toEqual({ index: 1, number: 1, count: 3, last: false });
  });

  it("starts at the line the tradie tapped, then the rest", () => {
    expect(startPriceSession(lines, 3).queue).toEqual([3, 1, 2]);
    // A tapped line that already has a price is ignored.
    expect(startPriceSession(lines, 0).queue).toEqual([1, 2, 3]);
  });

  it("save and skip move on; the last step says so; then it's done", () => {
    let s = startPriceSession(lines);
    s = advancePriceSession(s, "saved", true);
    expect(currentPriceStep(s)).toMatchObject({ index: 2, number: 2 });
    s = advancePriceSession(s, "skipped");
    expect(currentPriceStep(s)).toEqual({ index: 3, number: 3, count: 3, last: true });
    s = advancePriceSession(s, "saved", false);
    expect(priceSessionDone(s)).toBe(true);
    expect(currentPriceStep(s)).toBeNull();
    expect(s).toMatchObject({ saved: 2, skipped: 1, remembered: 1 });
  });

  it("an empty queue is done straight away", () => {
    const s = startPriceSession([line()]);
    expect(currentPriceStep(s)).toBeNull();
    expect(priceSessionDone(s)).toBe(true);
  });
});

describe("keypad money", () => {
  it("reads the typed digits as a price above zero", () => {
    expect(typedPrice("3.85")).toBe(3.85);
    expect(typedPrice("12.")).toBe(12);
    expect(typedPrice("")).toBeNull();
    expect(typedPrice(".")).toBeNull();
    expect(typedPrice("0")).toBeNull();
    expect(typedPrice("0.00")).toBeNull();
  });

  it("shows qty × price rounded to the cent like every saved line", () => {
    expect(previewLineTotal(28, "3.85")).toBe(107.8);
    expect(previewLineTotal(3, "0.335")).toBe(round2(3 * 0.335));
    expect(previewLineTotal(12.5, "19.99")).toBe(249.88);
    expect(previewLineTotal(28, "")).toBeNull();
  });

  it("prices just that line, through the classic edit rules", () => {
    const next = applyPrice(lines, 1, 3.85);
    expect(next[1]).toMatchObject({ unit_price: 3.85, line_total: 107.8, is_missing_price: false });
    expect(next[0]).toBe(lines[0]);
    expect(next[3]).toBe(lines[3]);
  });
});

describe("keypad words", () => {
  it("asks what you pay for materials and what you charge for the rest", () => {
    expect(priceQuestion(lines[1])).toBe("What do you pay for this?");
    expect(priceQuestion(lines[2])).toBe("What do you charge for this?");
  });

  it("labels the unit plainly", () => {
    expect(priceUnitLabel("each")).toBe("Price each");
    expect(priceUnitLabel("length")).toBe("Price per length");
    expect(priceUnitLabel("")).toBe("Price each");
  });

  it("offers Remember only for materials (only they go into the library)", () => {
    expect(canRemember(lines[1])).toBe(true);
    expect(canRemember(lines[2])).toBe(false);
  });

  it("sums up what happened", () => {
    const s = (saved: number, remembered: number) => ({ queue: [], at: 0, saved, skipped: 0, remembered });
    expect(priceSessionMessage(s(0, 0))).toBe("No prices added");
    expect(priceSessionMessage(s(1, 0))).toBe("1 price added");
    expect(priceSessionMessage(s(2, 2))).toBe("2 prices added and saved for next time");
    expect(priceSessionMessage(s(3, 1))).toBe("3 prices added, 1 saved for next time");
  });
});
