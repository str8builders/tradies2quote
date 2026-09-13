import { describe, expect, it } from "vitest";
import {
  datePartsInZone, formatLongDayDate, formatMonthYear, formatNZNumericDate, formatNZShortDate, formatNZTime,
  formatShortDayDate, formatWeekdayShort, parseDateKey,
} from "./format-date";

describe("engine-independent date labels", () => {
  it("matches the en-NZ wording the app used to get from Intl", () => {
    expect(formatMonthYear(2026, 8)).toBe("September 2026");
    expect(formatLongDayDate("2026-09-13")).toBe("Sunday, 13 September");
    expect(formatShortDayDate("2026-09-13")).toBe("Sun, 13 Sept");
    expect(formatWeekdayShort("2026-09-14")).toBe("Mon");
  });
  it("uses the NZ calendar day for instants, not the server's zone", () => {
    // 2026-09-13T11:30Z is 23:30 NZST the same day; 2026-09-13T12:30Z is 00:30 NZST on the 14th.
    expect(formatNZShortDate("2026-09-13T11:30:00Z")).toBe("13 Sept");
    expect(formatNZShortDate("2026-09-13T12:30:00Z")).toBe("14 Sept");
    expect(formatNZTime("2026-09-13T11:30:00Z")).toBe("11:30 pm");
    expect(formatNZTime("2026-09-13T12:30:00Z")).toBe("12:30 am");
    expect(formatNZNumericDate("2026-01-05T20:00:00Z")).toBe("06/01/2026");
    expect(datePartsInZone(new Date("2026-09-13T12:30:00Z"))).toMatchObject({ year: 2026, month: 9, day: 14, weekday: 1, hour: 0, minute: 30 });
  });
  it("rejects garbage without throwing", () => {
    expect(formatNZShortDate("nope")).toBe("—");
    expect(parseDateKey("2026-02-30")).toBeNull();
    expect(formatLongDayDate("2026-02-30")).toBe("2026-02-30");
  });
});
