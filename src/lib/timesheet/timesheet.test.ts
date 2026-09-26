import { describe, expect, it } from "vitest";
import { computeQuoteTotals } from "@/lib/quote-defaults";
import { formatHours, formatTime, parseTime, sumHours, timeValue, workedTime } from "./hours";
import { buildTimesheetInvoice, hoursByDay, kmByDay, parseKmRate, parseRate, type BillableEntry } from "./invoice";
import { addDays, dayLabel, parseDayKey, resolveWeek, weekDays, weekLabel, weekStart } from "./week";

describe("hours", () => {
  it("reads times the way the time picker and Postgres give them", () => {
    expect(parseTime("07:00")).toBe(420);
    expect(parseTime("7:05")).toBe(425);
    expect(parseTime("15:30:00")).toBe(930);
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("7")).toBeNull();
    expect(parseTime(null)).toBeNull();
    expect(timeValue(420)).toBe("07:00");
  });

  it("writes times the NZ way", () => {
    expect(formatTime("07:00")).toBe("7:00am");
    expect(formatTime("15:30")).toBe("3:30pm");
    expect(formatTime("12:00")).toBe("12:00pm");
    expect(formatTime("00:15")).toBe("12:15am");
  });

  it("works out hours from start, finish and break, as the database does", () => {
    expect(workedTime("07:00", "15:30", 30)).toEqual({ ok: true, minutes: 480, hours: 8 });
    expect(workedTime("06:45", "15:05", 20)).toEqual({ ok: true, minutes: 480, hours: 8 });
    expect(workedTime("07:00", "07:20", 0)).toEqual({ ok: true, minutes: 20, hours: 0.33 });
  });

  it("says plainly what's wrong", () => {
    expect(workedTime("", "15:00", 0)).toEqual({ ok: false, error: "Put in a start time." });
    expect(workedTime("07:00", "", 0)).toEqual({ ok: false, error: "Put in a finish time." });
    expect(workedTime("15:00", "07:00", 0).ok).toBe(false);
    expect(workedTime("07:00", "08:00", 60).ok).toBe(false);
    expect(workedTime("07:00", "18:00", 601).ok).toBe(false);
    expect(workedTime("07:00", "18:00", 1.5).ok).toBe(false);
  });

  it("shows and adds hours", () => {
    expect(formatHours(8)).toBe("8 h");
    expect(formatHours(7.5)).toBe("7.5 h");
    expect(formatHours(7.75)).toBe("7.75 h");
    expect(sumHours([0.33, 0.33, 0.33])).toBe(0.99);
  });
});

describe("weeks", () => {
  it("run Monday to Sunday", () => {
    expect(weekStart("2026-09-27")).toBe("2026-09-21"); // Sunday → the Monday before
    expect(weekStart("2026-09-21")).toBe("2026-09-21");
    expect(weekStart("2026-09-24")).toBe("2026-09-21");
    expect(weekDays("2026-09-21")).toEqual([
      "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27",
    ]);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("labels days and weeks in plain words", () => {
    expect(dayLabel("2026-09-21")).toBe("Mon 21 Sept");
    expect(weekLabel("2026-09-21")).toBe("21 to 27 Sept");
    expect(weekLabel("2026-09-28")).toBe("28 Sept to 4 Oct");
  });

  it("only trusts real days from the address bar", () => {
    expect(parseDayKey("2026-02-30")).toBeNull();
    expect(parseDayKey("2026-9-1")).toBeNull();
    expect(parseDayKey("x")).toBeNull();
    expect(resolveWeek("2026-09-24", "2026-10-10")).toBe("2026-09-21");
    expect(resolveWeek("nonsense", "2026-10-10")).toBe("2026-10-05");
    expect(resolveWeek(undefined, "2026-10-10")).toBe("2026-10-05");
  });
});

describe("hours to an invoice", () => {
  const entry = (id: string, workDate: string, hours: number, person = "Sam", note: string | null = null): BillableEntry => ({
    id, workDate, hours, person, note,
  });
  const client = { name: "Hemi Walker", email: "hemi@example.test", address: null, phone: null };
  const base = { rate: 80, client, period: "21 to 27 Sept", currency: "NZD", taxLabel: "GST", taxRate: 15 };

  it("one labour line per day, everyone's hours added, earliest first", () => {
    const result = buildTimesheetInvoice({
      ...base,
      entries: [entry("b", "2026-09-22", 7.5, "Sione", "Roof"), entry("a", "2026-09-21", 8), entry("c", "2026-09-21", 5, "Sione")],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.quoteData.line_items.map((l) => [l.description, l.quantity, l.unit, l.unit_price, l.line_total, l.type])).toEqual([
      ["Labour, Mon 21 Sept", 13, "h", 80, 1040, "labour"],
      ["Labour, Tue 22 Sept", 7.5, "h", 80, 600, "labour"],
    ]);
    expect(result.hours).toBe(20.5);
    expect(result.entryIds).toEqual(["b", "a", "c"]);
    expect(result.quoteData.notes).toEqual(["Tue 22 Sept: Roof (Sione)"]);
    expect(result.quoteData.job_summary).toBe("Labour, 21 to 27 Sept");
  });

  it("totals come from the app's own totals function (labour isn't marked up)", () => {
    const result = buildTimesheetInvoice({ ...base, entries: [entry("a", "2026-09-21", 8.33)] });
    if (!result.ok) throw new Error(result.error);
    const expected = computeQuoteTotals(result.quoteData.line_items, 0, 15);
    expect(result.quoteData.subtotal_before_tax).toBe(expected.subtotal_before_tax);
    expect(result.quoteData.tax_amount).toBe(expected.tax_amount);
    expect(result.quoteData.total).toBe(expected.total);
    expect(result.quoteData.total).toBe(766.36); // 8.33 × 80 = 666.40, + 15% = 766.36
    expect(result.quoteData.markup_amount).toBe(0);
  });

  it("refuses no hours, no rate or no client name", () => {
    expect(buildTimesheetInvoice({ ...base, entries: [] }).ok).toBe(false);
    expect(buildTimesheetInvoice({ ...base, rate: 0, entries: [entry("a", "2026-09-21", 8)] }).ok).toBe(false);
    expect(buildTimesheetInvoice({ ...base, client: { ...client, name: " " }, entries: [entry("a", "2026-09-21", 8)] }).ok).toBe(false);
  });

  it("reads a typed rate", () => {
    expect(parseRate("85")).toBe(85);
    expect(parseRate("$92.50")).toBe(92.5);
    expect(parseRate("0")).toBeNull();
    expect(parseRate("abc")).toBeNull();
    expect(parseRate(20000)).toBeNull();
    expect(hoursByDay([])).toEqual([]);
  });

  it("adds travel: one line per day with kilometres, at the rate per km", () => {
    const result = buildTimesheetInvoice({
      ...base,
      travelRate: 1.04,
      entries: [
        { ...entry("a", "2026-09-21", 8), km: 22.4 },
        { ...entry("b", "2026-09-21", 5, "Sione"), km: 10.1 },
        { ...entry("c", "2026-09-22", 7.5), km: null },
      ],
    });
    if (!result.ok) throw new Error(result.error);
    const travel = result.quoteData.line_items.filter((l) => l.type === "other");
    expect(travel.map((l) => [l.description, l.quantity, l.unit, l.unit_price, l.line_total])).toEqual([
      ["Travel, Mon 21 Sept", 32.5, "km", 1.04, 33.8],
    ]);
    expect(result.km).toBe(32.5);
    const expected = computeQuoteTotals(result.quoteData.line_items, 0, 15);
    expect(result.quoteData.total).toBe(expected.total);
    // Hours are unchanged by travel.
    expect(result.hours).toBe(20.5);
  });

  it("travel needs a sensible rate; no travel asked for, no travel lines", () => {
    expect(buildTimesheetInvoice({ ...base, travelRate: 0, entries: [{ ...entry("a", "2026-09-21", 8), km: 5 }] }).ok).toBe(false);
    const none = buildTimesheetInvoice({ ...base, entries: [{ ...entry("a", "2026-09-21", 8), km: 5 }] });
    expect(none.ok && none.quoteData.line_items.every((l) => l.type === "labour")).toBe(true);
    expect(parseKmRate("0.95")).toBe(0.95);
    expect(parseKmRate("25")).toBeNull();
    expect(kmByDay([{ ...entry("a", "2026-09-22", 1), km: 0.04 }])).toEqual([]);
  });
});
