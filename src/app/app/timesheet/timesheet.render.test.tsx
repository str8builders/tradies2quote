// The Timesheet tab as static HTML (node), plus its pure week shaping.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/app/timesheet",
}));
vi.mock("./actions", () => ({ saveTimeEntry: vi.fn(), deleteTimeEntry: vi.fn(), createTimesheetInvoice: vi.fn() }));

import { TimesheetView } from "./_components/TimesheetView";
import { nameFromEmail } from "./_lib/people";
import type { TimesheetData, TimesheetEntry } from "./_lib/types";
import { forPerson, groupByDay, unbilledByClient, weekTotals } from "./_lib/view";

const entry = (over: Partial<TimesheetEntry>): TimesheetEntry => ({
  id: "e1",
  workDate: "2026-09-21",
  start: "07:00",
  finish: "15:30",
  breakMinutes: 30,
  hours: 8,
  note: "Framing",
  clientId: "c1",
  clientName: "Hemi Walker",
  userId: "me",
  person: "You",
  mine: true,
  invoice: null,
  pins: null,
  km: null,
  ...over,
});

const data = (over: Partial<TimesheetData> = {}): TimesheetData => ({
  weekStart: "2026-09-21",
  today: "2026-09-23",
  entries: [
    entry({}),
    entry({ id: "e2", workDate: "2026-09-22", hours: 7.5, finish: "15:00", userId: "sione", person: "Sione", mine: false }),
    entry({ id: "e3", workDate: "2026-09-22", start: "06:00", finish: "07:00", breakMinutes: 0, hours: 1, clientId: "c2", clientName: "K. Patel", invoice: { id: "i1", number: "INV-AB12" } }),
  ],
  clients: [
    { id: "c1", name: "Hemi Walker", email: null, address: null, phone: null },
    { id: "c2", name: "K. Patel", email: null, address: null, phone: null },
  ],
  canInvoice: true,
  people: [{ userId: "me", name: "You" }, { userId: "sione", name: "Sione" }],
  labourRate: 80,
  currency: "NZD",
  taxLabel: "GST",
  taxRate: 15,
  failed: false,
  travelRate: null,
  ...over,
});

const html = (d: TimesheetData) => renderToStaticMarkup(<TimesheetView data={d} />);

describe("TimesheetView", () => {
  it("the week, its total, seven days, and the owner's two buttons", () => {
    const out = html(data());
    expect(out).toContain("21 to 27 Sept");
    expect(out).toContain("This week");
    expect(out).toMatch(/Team hours this week<\/p><p[^>]*>16.5 h<\/p>/);
    expect(out).toContain("1 h invoiced");
    expect(out.match(/data-day="/g)).toHaveLength(7);
    expect(out).toContain('data-testid="timesheet-add"');
    expect(out).toMatch(/data-testid="timesheet-invoice"(?![^>]*disabled)/);
    expect(out).toContain('href="/app/timesheet?week=2026-09-14"');
    expect(out).toContain('href="/app/timesheet?week=2026-09-28"');
    expect(out).toContain("Wed 23 Sept<span");
  });

  it("each entry: client, 7:00am to 3:30pm, break, who, hours; invoiced ones locked", () => {
    const out = html(data());
    expect(out).toContain("7:00am to 3:30pm · 30 min break · You");
    expect(out).toMatch(/<button[^>]*data-entry="e1"/);
    // Someone else's hours, and invoiced hours, can't be opened for editing.
    expect(out).toMatch(/<div data-entry="e2"/);
    expect(out).toMatch(/<div data-entry="e3"/);
    expect(out).toContain("On INV-AB12");
    expect(out).toContain("Add hours for Thu 24 Sept");
  });

  it("a team member: their own hours, no invoicing, no person filter", () => {
    const out = html(data({ canInvoice: false, people: [{ userId: "me", name: "You" }], entries: [entry({})] }));
    expect(out).toContain("Your hours this week");
    expect(out).not.toContain('data-testid="timesheet-invoice"');
    expect(out).not.toContain("Everyone");
  });

  it("invoice button off when there's nothing to bill", () => {
    const out = html(data({ entries: [entry({ invoice: { id: "i1", number: "INV-1" } })] }));
    expect(out).toMatch(/data-testid="timesheet-invoice"[^>]*disabled/);
  });

  it("says so when the hours couldn't load", () => {
    expect(html(data({ failed: true, entries: [] }))).toContain("Couldn&#x27;t load your hours");
  });
});

describe("week shaping", () => {
  const entries = data().entries;
  it("groups by day, Monday first, with day totals", () => {
    const days = groupByDay("2026-09-21", entries);
    expect(days.map((d) => [d.day, d.hours])).toEqual([
      ["2026-09-21", 8], ["2026-09-22", 8.5], ["2026-09-23", 0], ["2026-09-24", 0],
      ["2026-09-25", 0], ["2026-09-26", 0], ["2026-09-27", 0],
    ]);
    expect(days[1].entries.map((e) => e.id)).toEqual(["e3", "e2"]);
  });
  it("one person's hours, and totals", () => {
    expect(forPerson(entries, "sione").map((e) => e.id)).toEqual(["e2"]);
    expect(weekTotals(entries)).toEqual({ hours: 16.5, invoiced: 1 });
  });
  it("clients still to invoice (not billed, with a client)", () => {
    expect(unbilledByClient([...entries, entry({ id: "e4", clientId: null, clientName: null })])).toEqual([
      { clientId: "c1", name: "Hemi Walker", hours: 15.5, count: 2 },
    ]);
  });
  it("team members' names from their email", () => {
    expect(nameFromEmail("sione.tuilagi@example.nz")).toBe("Sione Tuilagi");
    expect(nameFromEmail("mike99@x.nz")).toBe("Mike");
    expect(nameFromEmail(null)).toBe("Team member");
  });
});
