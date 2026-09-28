import { describe, expect, it } from "vitest";
import {
  EMAIL_KINDS,
  kindForUser,
  lastDayWording,
  renderEmail,
  requiresNoQuotes,
  trialEndsLabel,
} from "./trial-emails";

const HOUR = 60 * 60 * 1000;
const START = new Date("2026-09-21T01:15:00Z"); // 1:15 pm NZST, Monday 21 Sep
const at = (hours: number) => new Date(START.getTime() + hours * HOUR);

const nzDay = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", year: "numeric", month: "numeric", day: "numeric" });
const nzHour = new Intl.DateTimeFormat("en-NZ", { timeZone: "Pacific/Auckland", hour: "numeric", hourCycle: "h23" });

/** 09:00 in New Zealand on the NZ calendar day that contains `day`, as an instant. */
function nineAmNz(day: Date): Date {
  const parts = nzDay.formatToParts(day);
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  // Try both NZ offsets; keep the one that really is 09:00 there.
  for (const offset of [12, 13]) {
    const candidate = new Date(Date.UTC(n("year"), n("month") - 1, n("day"), 9 - offset));
    if (Number(nzHour.format(candidate)) === 9) return candidate;
  }
  throw new Error("no 09:00");
}

/** Every 09:00 NZ scheduler run from `from` to `to`, in order. */
function runsBetween(from: Date, to: Date): Date[] {
  const runs = new Map<number, Date>();
  for (let t = from.getTime() - 24 * HOUR; t <= to.getTime() + 24 * HOUR; t += 6 * HOUR) {
    const run = nineAmNz(new Date(t));
    if (run >= from && run <= to) runs.set(run.getTime(), run);
  }
  return [...runs.values()].sort((a, b) => a.getTime() - b.getTime());
}

describe("which email, when", () => {
  it("each window, in order", () => {
    expect(kindForUser(START, at(23.9))).toBeNull();
    expect(kindForUser(START, at(24))).toBe("onboarding_24h");
    expect(kindForUser(START, at(71))).toBe("onboarding_24h");
    expect(kindForUser(START, at(72))).toBe("onboarding_3day");
    expect(kindForUser(START, at(100))).toBe("trial_minus_2");
    expect(kindForUser(START, at(142))).toBe("trial_day_0");
    expect(kindForUser(START, at(167.99))).toBe("trial_day_0");
    expect(kindForUser(START, at(239))).toBeNull();
    expect(kindForUser(START, at(240))).toBe("trial_plus_3");
  });

  it("the last-day email is never sent once the trial has ended", () => {
    // It used to open at 168 h: the moment the account locked.
    expect(kindForUser(START, at(168))).toBeNull();
    expect(kindForUser(START, at(190))).toBeNull();
  });

  it("with the daily 09:00 NZ run, every trial gets its last-day email before it ends", () => {
    // Signups every 20 minutes across three weeks around each NZ
    // daylight-saving change (27 Sep 2026 and 4 Apr 2027).
    for (const from of [new Date("2026-09-15T00:00:00Z"), new Date("2027-03-25T00:00:00Z")]) {
      const allRuns = runsBetween(from, new Date(from.getTime() + 35 * 24 * HOUR));
      for (let minutes = 0; minutes < 21 * 24 * 60; minutes += 20) {
        const signup = new Date(from.getTime() + minutes * 60 * 1000);
        const end = new Date(signup.getTime() + 168 * HOUR);
        const runs = allRuns.filter((run) => run.getTime() >= signup.getTime() + 120 * HOUR && run.getTime() <= signup.getTime() + 200 * HOUR);
        const sent = runs.filter((run) => kindForUser(signup, run) === "trial_day_0");
        expect(sent.length, signup.toISOString()).toBeGreaterThan(0);
        for (const run of sent) expect(run.getTime()).toBeLessThan(end.getTime());
      }
    }
  });

  it("only the onboarding nudges need 'no quote yet'", () => {
    expect(EMAIL_KINDS.filter(requiresNoQuotes)).toEqual(["onboarding_24h", "onboarding_3day"]);
  });
});

describe("last-day wording", () => {
  it("today or tomorrow, at the real end time in NZ", () => {
    // Trial ends 2026-09-28T01:15Z = 2:15 pm NZDT on Mon 28 Sep (NZDT from 27 Sep).
    expect(lastDayWording(START, new Date("2026-09-27T20:00:00Z"))).toEqual({ day: "today", time: "2:15 pm" });
    expect(lastDayWording(START, new Date("2026-09-26T21:00:00Z"))).toEqual({ day: "tomorrow", time: "2:15 pm" });
    const early = new Date("2026-09-21T19:30:00Z"); // ends 8:30 am NZDT Tue 29 Sep
    expect(lastDayWording(early, new Date("2026-09-27T20:00:00Z"))).toEqual({ day: "tomorrow", time: "8:30 am" });
  });

  it("falls back to the date if it is further away", () => {
    expect(lastDayWording(START, new Date("2026-09-25T20:00:00Z")).day).toBe(`on ${trialEndsLabel(START)}`);
  });
});

describe("what the emails say", () => {
  const args = { firstName: "Mike", appUrl: "https://tradies2quote.com", trialEndsLabel: "Mon 28 Sep" };

  it("the first nudge is plain and doesn't overpromise", () => {
    const email = renderEmail("onboarding_24h", { ...args, videoUrl: "https://example.invalid/demo" });
    expect(email.subject).toBe("Make your first quote");
    for (const part of [email.subject, email.text, email.html]) {
      expect(part).not.toMatch(/60[- ]?sec/i);
      expect(part).not.toMatch(/most tradies/i);
      expect(part).not.toMatch(/signed up yesterday/i);
    }
    expect(email.text).toContain("You haven't made a quote yet.");
  });

  it("prices say the currency", () => {
    for (const kind of ["trial_minus_2", "trial_day_0", "trial_plus_3"] as const) {
      const email = renderEmail(kind, args);
      expect(email.text, kind).toContain("NZ$49 a month");
      expect(email.html, kind).toContain("NZ$49 a month");
      expect(`${email.text}${email.html}`, kind).not.toMatch(/(?<!NZ)\$49|\/mo\b/);
    }
  });

  it("the last-day email says exactly when, and arrives before it", () => {
    const email = renderEmail("trial_day_0", { ...args, trialEnds: { day: "today", time: "2:15 pm" } });
    expect(email.subject).toBe("Your free trial ends today");
    expect(email.text).toContain("Your free trial ends today at 2:15 pm (NZ time).");
    expect(email.text).not.toMatch(/tonight/i);
    expect(email.html).toContain("today at 2:15 pm (NZ time)");
  });

  it("the two-day warning names the date instead of guessing the days left", () => {
    expect(renderEmail("trial_minus_2", args).subject).toBe("Your free trial ends Mon 28 Sep");
  });
});
