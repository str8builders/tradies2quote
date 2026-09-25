import { describe, expect, it } from "vitest";
import { extractFromText } from "../extraction";
import { runTakeoff } from "../orchestrator";

// Golden L02. The lining calculator reads how many faces are lined from the
// extraction's notes, but the regex extraction never wrote any — so "GIB both
// sides" was lost on the orchestrator path (an area-only lining job) and half
// the lining went missing from the price (10 sheets instead of 19).

const lining = (text: string) => runTakeoff(text).scopes.find((s) => s.scope === "lining");
const qty = (text: string, id: string) => lining(text)?.lines.find((l) => l.id === id)?.quantity;

describe("the lined faces the tradie states reach the lining calculator", () => {
  const BOTH = "Partition wall is 24 square metres, GIB both sides.";

  it("extraction records 'both sides' / 'one side' for the lining scope", () => {
    expect(extractFromText(BOTH, "lining").notes.join(" ")).toMatch(/both sides/i);
    expect(extractFromText("Line 24 square metres of wall, GIB one side.", "lining").notes.join(" ")).toMatch(/one side/i);
    expect(extractFromText("Line 24 square metres of wall.", "lining").notes).toEqual([]);
  });

  it("24 m² GIB both sides: 19 sheets, 836 screws, 5 tubes (was 10 / 440 / 3)", () => {
    // 24 × 2 faces = 48 m² × 1.1 = 52.8 ÷ 2.88 = 18.33 → 19; 19 × 40 × 1.1 = 836; 19 ÷ 4 → 5
    expect(qty(BOTH, "lining-sheets")).toBe(19);
    expect(qty(BOTH, "lining-screws")).toBe(836);
    expect(qty(BOTH, "lining-adhesive")).toBe(5);
    expect(lining(BOTH)?.assumptions.join(" ")).not.toMatch(/one side only/i);
  });

  it("'one side' is taken as stated, with no 'assumed one side' flag", () => {
    const text = "Line 24 square metres of wall, GIB one side.";
    expect(qty(text, "lining-sheets")).toBe(10); // 24 × 1.1 ÷ 2.88 = 9.17 → 10
    expect(lining(text)?.assumptions.join(" ")).not.toMatch(/one side only/i);
  });

  it("no faces stated: one side, and the assumption says so", () => {
    const text = "Line 24 square metres of wall with GIB.";
    expect(qty(text, "lining-sheets")).toBe(10);
    expect(lining(text)?.assumptions.join(" ")).toMatch(/assumed lining one side only/i);
  });
});
