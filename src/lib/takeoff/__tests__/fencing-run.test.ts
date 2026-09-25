import { describe, expect, it } from "vitest";
import { extractFromText } from "../extraction";
import { runTakeoff } from "../orchestrator";

// Golden FE03 / FE04. "20 metres of paling fence" wasn't read as the fence
// run ("paling" sits between "of" and "fence"), so the fence scope was
// blocked; and the fencing calculator always used 1.8 m post centres even
// when the tradie said "posts at 2.4m centres" — the very wording its own
// assumption note asks for.

const fencing = (text: string) => runTakeoff(text).scopes.find((s) => s.scope === "fencing");
const qty = (text: string, id: string) => fencing(text)?.lines.find((l) => l.id === id)?.quantity;

describe("the fence run is read the way a tradie says it (golden FE03)", () => {
  it("reads descriptive fence runs", () => {
    const run = (t: string) => extractFromText(t, "fencing").dimensions.perimeter_m;
    expect(run("20 metres of paling fence, 1.8 high.")).toBe(20);
    expect(run("30m of new timber paling fencing")).toBe(30);
    expect(run("15 m of post and rail fence")).toBe(15);
    expect(run("12.5m of pool fencing")).toBe(12.5);
    expect(run("20m of fencing, 1.8 high")).toBe(20); // unchanged
  });

  it("doesn't read another thing's length as the fence run", () => {
    expect(extractFromText("6m of deck and a gate in the fence", "fencing").dimensions.perimeter_m).toBeNull();
  });

  it("20 metres of paling fence: 13 posts, 10 rails, 191 palings, 0.65 m³ (was blocked — no lines)", () => {
    const text = "20 metres of paling fence, 1.8 high. 2 days at $580 a day.";
    expect(fencing(text)?.status).not.toBe("blocked");
    expect(qty(text, "fence-posts")).toBe(13); // 20 ÷ 1.8 = 11.11 → 12 bays → 13
    expect(qty(text, "fence-rails")).toBe(10); // 40 m × 1.1 ÷ 4.8 = 9.17 → 10
    expect(qty(text, "fence-palings")).toBe(191); // 20 000 ÷ 105 = 190.48 → 191
    expect(qty(text, "fence-post-concrete")).toBe(0.65);
  });
});

describe("the post spacing the tradie gives is used (golden FE04)", () => {
  it("reads the post centres in the usual phrasings", () => {
    const mm = (t: string) => extractFromText(t, "fencing").spacing_mm;
    expect(mm("24m of fencing, posts at 2.4m centres")).toBe(2400);
    expect(mm("24m of fencing, posts at 2400 centres")).toBe(2400);
    expect(mm("24m of fencing, post spacing 2.4m")).toBe(2400);
    expect(mm("24m of fencing, posts every 2.4 m")).toBe(2400);
    expect(mm("24m of fencing, posts 2.4m apart")).toBe(2400);
    expect(mm("24m of fencing, 2.4m post centres")).toBe(2400);
    expect(mm("24m of fencing, 1.8 high")).toBeNull();
    // A post's own size or length is never a spacing.
    expect(mm("24m of fencing, 125x125 posts 2.4m long")).toBeNull();
  });

  it("24 m with posts at 2.4 m centres: 11 posts, 0.55 m³ (was 15 posts, 0.75 m³ at 1.8 m)", () => {
    const text = "24m of fencing, 1.8 high, posts at 2.4m centres.";
    expect(qty(text, "fence-posts")).toBe(11); // 24 ÷ 2.4 = 10 bays → 11
    expect(qty(text, "fence-post-concrete")).toBe(0.55);
    expect(qty(text, "fence-rails")).toBe(11); // 48 m × 1.1 ÷ 4.8 = exactly 11
    expect(qty(text, "fence-palings")).toBe(229);
    const notes = fencing(text)?.assumptions.join(" ") ?? "";
    expect(notes).not.toMatch(/Assumed 1\.8m post spacing/);
  });

  it("no spacing given: 1.8 m centres, and the assumption says so", () => {
    const text = "24m of fencing, 1.8 high.";
    expect(qty(text, "fence-posts")).toBe(15); // 24 ÷ 1.8 = 13.33 → 14 bays → 15
    expect(fencing(text)?.assumptions.join(" ")).toMatch(/Assumed 1\.8m post spacing/);
  });

  it("a post spacing that can't be right is not used — the default is, and the note says why", () => {
    const text = "24m of fencing, 1.8 high, posts at 6m centres.";
    expect(qty(text, "fence-posts")).toBe(15);
    expect(fencing(text)?.assumptions.join(" ")).toMatch(/Post spacing 6m .*used 1\.8m/);
  });
});
