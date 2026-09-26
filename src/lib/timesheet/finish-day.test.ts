import { describe, expect, it } from "vitest";
import { dayIn, defaultFinish, finishOnStartDay, shiftDay, startedEarlierDay, timeIn, zonedMoment } from "./finish-day";

const NZ = "Pacific/Auckland";
// Sat 26 Sept 2026, 11:19am NZST (+12). NZ daylight saving started at 2am on Sun 27 Sept (+13).
const STARTED = "2026-09-25T23:19:00.000Z";
// Sun 27 Sept, 4:54am NZDT: the phone asking to finish the next morning.
const NEXT_MORNING = Date.parse("2026-09-26T15:54:00.000Z");

describe("a shift that started on an earlier day", () => {
  it("is spotted in the business's time zone", () => {
    expect(dayIn(Date.parse(STARTED), NZ)).toBe("2026-09-26");
    expect(timeIn(Date.parse(STARTED), NZ)).toBe("11:19");
    expect(startedEarlierDay(STARTED, NEXT_MORNING, NZ)).toBe(true);
    // Same day, later on: not earlier.
    expect(startedEarlierDay(STARTED, Date.parse("2026-09-26T04:00:00.000Z"), NZ)).toBe(false);
    expect(startedEarlierDay("not a date", NEXT_MORNING, NZ)).toBe(false);
  });

  it("turns a wall-clock time into the right moment, across the daylight-saving change", () => {
    // 5pm on Sat 26 Sept is NZST (+12), even though the guess lands after the change.
    expect(new Date(zonedMoment("2026-09-26", "17:00", NZ)!).toISOString()).toBe("2026-09-26T05:00:00.000Z");
    // 9am on Sun 27 Sept is NZDT (+13).
    expect(new Date(zonedMoment("2026-09-27", "09:00", NZ)!).toISOString()).toBe("2026-09-26T20:00:00.000Z");
    expect(zonedMoment("2026-09-26", "25:00", NZ)).toBeNull();
    expect(zonedMoment("26/09/2026", "17:00", NZ)).toBeNull();
  });

  it("the finish must be after the start, on that day, and not in the future", () => {
    expect(new Date(finishOnStartDay(STARTED, "17:00", NEXT_MORNING, NZ)!).toISOString()).toBe("2026-09-26T05:00:00.000Z");
    expect(new Date(finishOnStartDay(STARTED, "23:59", NEXT_MORNING, NZ)!).toISOString()).toBe("2026-09-26T11:59:00.000Z");
    expect(finishOnStartDay(STARTED, "11:00", NEXT_MORNING, NZ)).toBeNull(); // before the start
    expect(finishOnStartDay(STARTED, "11:20", NEXT_MORNING, NZ)).toBeNull(); // under a minute of work
    // Asked at 3pm the same day, 5pm hasn't happened yet.
    expect(finishOnStartDay(STARTED, "17:00", Date.parse("2026-09-26T03:00:00.000Z"), NZ)).toBeNull();
  });

  it("starts the picker at 5pm, or an hour after a late start", () => {
    expect(defaultFinish(STARTED, NZ)).toBe("17:00");
    expect(defaultFinish("2026-09-26T05:30:00.000Z", NZ)).toBe("18:30"); // started 5:30pm
    expect(defaultFinish("2026-09-26T11:30:00.000Z", NZ)).toBe("23:59"); // started 11:30pm
  });

  it("names the day the way the app does", () => {
    expect(shiftDay(STARTED, NZ)).toMatch(/^Sat 26 Sep/);
  });
});
