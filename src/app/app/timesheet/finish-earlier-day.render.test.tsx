// Finishing a shift you forgot to finish: the sheet asks when you stopped
// that day instead of failing, and the card says which day you started.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
vi.mock("./location-actions", () => ({
  clockIn: vi.fn(),
  clockOut: vi.fn(),
  pinJobSite: vi.fn(),
  saveLocationConsent: vi.fn(),
  getLocationState: vi.fn(),
  issueDeviceKey: vi.fn(),
  sendRoutePoints: vi.fn(),
}));

import { FinishForm, sinceLabel } from "./_components/ClockCard";
import { DEFAULT_CONSENT, type LocationState } from "./_lib/location-types";

const NZ = "Pacific/Auckland";
const STARTED = "2026-09-25T23:19:00.000Z"; // Sat 26 Sept, 11:19am
const state: LocationState = {
  consent: { ...DEFAULT_CONSENT, granted: true },
  open: { id: "s1", startedAt: STARTED, place: "Not at a job site", clientId: null, clientName: null, source: "tap" },
  sites: [],
  geofences: [],
  timeZone: NZ,
};
const form = (now: number) =>
  renderToStaticMarkup(<FinishForm state={state} clients={[]} onClose={() => {}} onDone={() => {}} now={now} />);

describe("finishing a shift from an earlier day", () => {
  it("the next morning, asks when you stopped that day, starting at 5pm", () => {
    const out = form(Date.parse("2026-09-26T15:54:00.000Z")); // Sun 4:54am
    expect(out).toContain('data-testid="finish-earlier-day"');
    expect(out).toMatch(/You started on Sat 26 Sep\w* at 11:19am and didn&#x27;t tap Finish/);
    expect(out).toMatch(/Finished on Sat 26 Sep\w* at/);
    expect(out).toContain('type="time"');
    expect(out).toContain('value="17:00"');
  });

  it("the same day, it's the usual finish: no time to pick", () => {
    const out = form(Date.parse("2026-09-26T04:00:00.000Z")); // Sat 4pm
    expect(out).not.toContain('data-testid="finish-earlier-day"');
    expect(out).toContain('data-testid="clock-finish-confirm"');
  });

  it("the card says which day a shift from an earlier day started", () => {
    expect(sinceLabel(STARTED, Date.parse("2026-09-26T15:54:00.000Z"), NZ)).toMatch(/^Sat 26 Sep\w*, 11:19am$/);
    expect(sinceLabel(STARTED, Date.parse("2026-09-26T04:00:00.000Z"), NZ)).toBe("11:19am");
  });
});
