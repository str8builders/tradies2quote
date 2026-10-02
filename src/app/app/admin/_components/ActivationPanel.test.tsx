import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EMPTY_ACTIVATION, type ActivationSection } from "@/lib/admin/activation";
import { ActivationPanel, formatDays, formatHours } from "./ActivationPanel";

const section: ActivationSection = {
  steps: [
    { id: "signed-up", label: "Signed up", count: 8, share: 1 },
    { id: "confirmed", label: "Confirmed their email", count: 7, share: 0.875 },
    { id: "business", label: "Set up their business", count: 6, share: 0.75 },
    { id: "quote", label: "Made a quote", count: 4, share: 0.5 },
    { id: "sent", label: "Sent a quote", count: 2, share: 0.25 },
    { id: "won", label: "Had a quote accepted", count: 1, share: 0.125 },
  ],
  activeThisWeek: 3,
  medianHoursToFirstQuote: 3.2,
  unconfirmed: [{ email: "x@nolink.nz", days: 5, quotes: 0 }],
  stuckNoQuote: [
    { email: "e@old.nz", days: 20, quotes: 0 },
    { email: "c@plumbing.nz", days: 1, quotes: 0 },
  ],
  quotedNotSent: [{ email: "b@sparky.nz", days: 3, quotes: 2 }],
  excluded: { internal: ["owner", "review"], teamWorkers: 1 },
  error: null,
};

describe("<ActivationPanel>", () => {
  const html = renderToStaticMarkup(<ActivationPanel activation={section} />);

  it("shows every step with its count and share, in order", () => {
    const steps = [...html.matchAll(/data-step="([a-z-]+)"/g)].map((m) => m[1]);
    expect(steps).toEqual(["signed-up", "confirmed", "business", "quote", "sent", "won"]);
    expect(html).toContain("Signed up");
    expect(html).toContain("100%");
    expect(html).toContain("75%");
    expect(html).toContain("13%"); // 12.5% rounds to 13
    expect(html).toContain('style="width:50%"');
  });

  it("the bars are decoration: the numbers are the text", () => {
    expect(html).toMatch(/aria-hidden="true" class="mt-1\.5 h-2/);
  });

  it("names who stopped where, with how long", () => {
    expect(html).toContain('data-testid="activation-unconfirmed"');
    expect(html).toContain("x@nolink.nz");
    expect(html).toContain("signed up, never confirmed their email");
    expect(html).toContain("e@old.nz");
    expect(html).toContain("20 days since signing up");
    expect(html).toContain("1 day since signing up");
    expect(html).toContain("b@sparky.nz");
    expect(html).toContain("2 quotes · 3 days since the first");
  });

  it("shows the week's quoting and the median time to a first quote", () => {
    expect(html).toContain("Quoting this week");
    expect(html).toMatch(/Quoting this week[\s\S]*?>3</);
    expect(html).toContain("3.2 h");
  });

  it("says exactly what was left out", () => {
    expect(html).toContain("Not counted: your own account, the App Review demo account and 1 team worker.");
  });

  it("a clear list says so in words", () => {
    const clear = renderToStaticMarkup(
      <ActivationPanel
        activation={{ ...section, unconfirmed: [], stuckNoQuote: [], quotedNotSent: [], excluded: { internal: [], teamWorkers: 0 } }}
      />,
    );
    expect(clear).not.toContain('data-testid="activation-unconfirmed"');
    expect(clear).toContain("Everyone who confirmed over a day ago has made a quote.");
    expect(clear).toContain("Everyone who made a quote has sent one.");
    expect(clear).not.toContain("Not counted");
  });

  it("an error shows as the error, and no customers yet as a note", () => {
    expect(renderToStaticMarkup(<ActivationPanel activation={{ ...EMPTY_ACTIVATION, error: "boom" }} />)).toContain("boom");
    const none = renderToStaticMarkup(
      <ActivationPanel activation={{ ...section, steps: section.steps.map((s) => ({ ...s, count: 0, share: 0 })) }} />,
    );
    expect(none).toContain("No customers yet. Not counted: your own account, the App Review demo account and 1 team worker.");
    expect(none).not.toContain("data-step");
  });
});

describe("how the panel says time", () => {
  it("days", () => {
    expect(formatDays(0)).toBe("today");
    expect(formatDays(1)).toBe("1 day");
    expect(formatDays(12)).toBe("12 days");
  });

  it("hours: minutes under one, tenths under two days, then days", () => {
    expect(formatHours(null)).toBe("—");
    expect(formatHours(0.3)).toBe("18 min");
    expect(formatHours(0.001)).toBe("1 min");
    expect(formatHours(3)).toBe("3 h");
    expect(formatHours(3.25)).toBe("3.3 h");
    expect(formatHours(47.9)).toBe("47.9 h");
    expect(formatHours(96)).toBe("4 days");
  });
});
