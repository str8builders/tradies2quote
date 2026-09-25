import { describe, expect, it } from "vitest";
import { extractFromText } from "../extraction";
import { roofAreaFromPitch } from "../normalise";
import { runTakeoff } from "../orchestrator";

// Golden R01 / R02 / R03. Long-run sheets are laid side by side along the
// gutter (eave) and cut to the rafter length: sheets = gutter length ÷ 0.762 m
// cover, rounded up once — no waste on the COUNT (the last sheet is ripped).
// The calculator counted sheets across the SHORTER plan side and added 10 %:
// a 12 × 8 m skillion with the gutter on the 12 m side got 12 sheets, not 16.
// And the screw count rounded the roof area to 0.01 m² before rounding up,
// so 24.0917 m² × 6.6 = 159.005 screws came out 159, not 160.

const roofing = (text: string) => runTakeoff(text).scopes.find((s) => s.scope === "roofing");
const line = (text: string, id: string) => roofing(text)?.lines.find((l) => l.id === id);

const R01 =
  "Re-roof a skillion roof in long-run coloursteel. Plan is 12 by 8, gutter runs the 12m side, 15 degree pitch.";

describe("long-run sheets are counted along the gutter (golden R01)", () => {
  it("reads the gutter length the tradie names", () => {
    expect(extractFromText(R01, "roofing").dimensions.eave_m).toBe(12);
    expect(extractFromText("Lean-to 6 by 4, gutter along the 4m side", "roofing").dimensions.eave_m).toBe(4);
    expect(extractFromText("Carport 6 by 4, spouting on the 6 m side", "roofing").dimensions.eave_m).toBe(6);
    expect(extractFromText("New roof, 14.4m of spouting, 20 degree pitch", "roofing").dimensions.eave_m).toBe(14.4);
    expect(extractFromText("Re-roof 12 by 8, 15 degree pitch", "roofing").dimensions.eave_m).toBeNull();
  });

  it("12 m gutter: 16 sheets (12 ÷ 0.762 = 15.75 → 16), each cut to 8 ÷ cos 15° = 8.28 m — was 12", () => {
    const sheets = line(R01, "roof-sheets");
    expect(sheets?.quantity).toBe(16);
    expect(sheets?.basis.inputs.eave_length_m).toBe(12);
    expect(sheets?.basis.inputs.sheet_length_m).toBe(8.28);
    expect(sheets?.basis.formula).toMatch(/8\.28 ?m/);
  });

  it("no waste is added to the sheet count (waste still applies to the screws)", () => {
    const text = `${R01} 20% waste.`;
    expect(line(text, "roof-sheets")?.quantity).toBe(16);
    // 96 ÷ cos 15° = 99.3862 m² × 6 × 1.2 = 715.58 → 716
    expect(line(text, "roof-fixings")?.quantity).toBe(716);
  });

  it("gutter on the short side: 6 × 4 lean-to, gutter on the 4 m side → 6 sheets cut to 6.09 m", () => {
    const text = "Carport lean-to, long-run coloursteel, 6 by 4, gutter along the 4m side, 10 degree pitch.";
    expect(line(text, "roof-sheets")?.quantity).toBe(6); // 4 ÷ 0.762 = 5.25 → 6
    expect(line(text, "roof-sheets")?.basis.inputs.sheet_length_m).toBe(6.09); // 6 ÷ cos 10°
  });

  it("gutter not named: assumes it runs along the longer side, and says so", () => {
    const text = "Re-roof in long-run coloursteel, 12 by 8, 15 degree pitch.";
    expect(line(text, "roof-sheets")?.quantity).toBe(16);
    expect(roofing(text)?.assumptions.join(" ")).toMatch(/gutter runs along the 12 ?m side/i);
  });
});

describe("the screw count rounds up once, from the real roof area (golden R03)", () => {
  it("roofAreaFromPitch keeps the exact area (rounding is for display only)", () => {
    expect(roofAreaFromPitch(24, 5)).toBeCloseTo(24.0917, 4);
    expect(roofAreaFromPitch(24, 5)).not.toBe(24.09);
  });

  it("6 × 4 at 5°: 24.0917 m² × 6 × 1.1 = 159.005 → 160 screws (was 159 from 24.09)", () => {
    const text = "Pergola roof off the house, trapezoidal long-run, 6 by 4, gutter on the 4m side, 5 degree pitch.";
    expect(line(text, "roof-fixings")?.quantity).toBe(160);
    // The area shown to the tradie is still to the cent-metre.
    expect(roofing(text)?.summary.primary_value).toBe(24.09);
  });
});
