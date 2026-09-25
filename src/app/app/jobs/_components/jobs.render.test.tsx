// Markup contracts for the Jobs list (static HTML in node).

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const url = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(url.search),
  usePathname: () => "/app/jobs",
}));

import { NOW, NZ, daysAgo, invoice, quote } from "../../_v2/lib/fixtures";
import { buildJobRows, type JobRow } from "../../_v2/lib/job-board";
import { FilterChips } from "./FilterChips";
import { JOBS_PAGE_SIZE, JobsBrowser } from "./JobsBrowser";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const hrefs = (markup: string) =>
  [...markup.matchAll(/<a [^>]*href="(\/app\/quotes\/preview\/[^"]+)"/g)].map((m) => m[1]);

function board(): JobRow[] {
  const done = quote({ id: "fence", status: "completed", clientName: "Ben Walker", jobSummary: "Fence repair" });
  const paid = quote({ id: "deck", status: "completed", clientName: "Sam Taylor", jobSummary: "Deck at 14 Rata St" });
  return buildJobRows(
    [
      quote({ id: "bath", status: "draft", clientName: "Aroha Ngata", jobSummary: "Bathroom reline", createdAt: daysAgo(1) }),
      quote({ id: "gate", status: "sent", sentAt: daysAgo(4), clientName: "Mere Hohaia", jobSummary: "New gate" }),
      quote({ id: "roof", status: "scheduled", scheduledFor: "2026-09-29", clientName: "Tom Reid", jobSummary: "Re-roof" }),
      done,
      paid,
      quote({ id: "old", status: "declined", archived: true, clientName: "Kate Moss" }),
    ],
    [
      invoice("fence", { status: "sent", dueDate: daysAgo(9), total: 1240 }),
      invoice("deck", { status: "paid", paidAt: daysAgo(2), total: 4830 }),
    ],
    NOW,
    NZ,
  );
}

beforeEach(() => {
  url.search = "";
});

describe("FilterChips", () => {
  it("six choices as one radio group, one checked and one tab stop", () => {
    const out = html(<FilterChips value="unpaid" onChange={() => {}} />);
    expect(out).toMatch(/role="radiogroup" aria-label="Show"/);
    expect(out.match(/role="radio"/g)).toHaveLength(6);
    expect(out.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(out).toMatch(/aria-checked="true" tabindex="0" data-filter="unpaid"/);
    expect(out.match(/tabindex="-1"/g)).toHaveLength(5);
    for (const label of ["All", "To send", "Waiting", "Booked", "Unpaid", "Done"]) expect(out).toContain(`<span>${label}</span>`);
    expect(out).toContain("min-h-12");
    // The chosen chip wears its own colour (Unpaid: red); the rest show a dot.
    expect(out).toMatch(/data-filter="unpaid" class="[^"]*border-ui-bad[^"]*bg-ui-bad-soft/);
    expect(out.match(/rounded-full bg-ui-/g)).toHaveLength(4);
  });

  it("shows how many jobs each filter holds", () => {
    const counts = { all: 9, "to-send": 2, waiting: 1, booked: 3, unpaid: 2, done: 1 } as const;
    const out = html(<FilterChips value="all" onChange={() => {}} counts={counts} />);
    expect(out).toMatch(/<span>To send<\/span><span[^>]*>2<\/span>/);
    expect(out).toMatch(/<span>All<\/span><span[^>]*>9<\/span>/);
  });
});

describe("JobsBrowser", () => {
  it("All: every job, newest first, each row opening its job page", () => {
    const out = html(<JobsBrowser rows={board()} />);
    expect(out).toMatch(/aria-checked="true" tabindex="0" data-filter="all"/);
    expect(hrefs(out)).toHaveLength(6);
    expect(hrefs(out)[0]).toBe("/app/quotes/preview/bath");
    expect(out).toContain(">6 jobs</p>");
    expect(out).toContain('<input type="search"');
    expect(out).toContain('placeholder="Client or job"');
  });

  it("each row: client, job in one line, a plain status pill, amount", () => {
    const out = html(<JobsBrowser rows={board()} />);
    expect(out).toContain(">Ben Walker</span>");
    expect(out).toMatch(/<span class="block truncate">Fence repair<\/span>/);
    expect(out).toContain(">9 days late</span>");
    expect(out).toContain(">Waiting for Mere</span>");
    expect(out).toContain(">Booked Tue 29 Sept</span>");
    expect(out).toContain(">Paid</span>");
    expect(out).toContain(">Draft</span>");
    expect(out).toContain("$1,240.00");
    expect(out).toContain(">Archived</span>");
  });

  it("?show=unpaid opens on Unpaid, most urgent first", () => {
    url.search = "show=unpaid";
    const out = html(<JobsBrowser rows={board()} />);
    expect(out).toMatch(/aria-checked="true" tabindex="0" data-filter="unpaid"/);
    expect(hrefs(out)).toEqual(["/app/quotes/preview/fence"]);
    expect(out).toContain(">1 job</p>");
  });

  it("?q= searches by client or job", () => {
    url.search = "q=walker";
    const out = html(<JobsBrowser rows={board()} />);
    expect(out).toContain('value="walker"');
    expect(hrefs(out)).toEqual(["/app/quotes/preview/fence"]);
    expect(out).toContain("1 job matches “walker”");
  });

  it("an empty filter says so and offers all jobs", () => {
    url.search = "show=booked";
    const rows = board().filter((r) => r.filter !== "booked");
    const out = html(<JobsBrowser rows={rows} />);
    expect(out).toMatch(/<h2 [^>]*>Nothing booked<\/h2>/);
    expect(out).toContain(">Show all jobs</span>");
  });

  it("a search with no match offers to clear it, or search everything", () => {
    url.search = "show=waiting&q=zzz";
    const out = html(<JobsBrowser rows={board()} />);
    expect(out).toContain("No jobs match “zzz”");
    expect(out).toContain(">Clear search</span>");
    expect(out).toContain(">Search all jobs</span>");
  });

  it("no jobs at all: start a quote", () => {
    const out = html(<JobsBrowser rows={[]} />);
    expect(out).toMatch(/<h2 [^>]*>No jobs yet<\/h2>/);
    expect(out).toMatch(/<a [^>]*href="\/app\/quotes\/new"/);
    expect(out).toContain(">0 jobs</p>");
  });

  it("long lists load more a page at a time", () => {
    const rows = buildJobRows(
      Array.from({ length: JOBS_PAGE_SIZE + 7 }, (_, i) => quote({ id: `d${i}`, status: "draft" })),
      [],
      NOW,
      NZ,
    );
    const out = html(<JobsBrowser rows={rows} />);
    expect(hrefs(out)).toHaveLength(JOBS_PAGE_SIZE);
    expect(out).toContain(">Show 7 more</span>");
  });
});
