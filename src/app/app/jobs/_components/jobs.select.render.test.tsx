// Markup contracts for deleting jobs: the Select button, select mode's tick
// rows, the docked bars, the "Delete 3 jobs?" check and Recently deleted
// (static HTML in node).

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const url = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(url.search),
  usePathname: () => "/app/jobs",
}));
vi.mock("../actions", () => ({ deleteJobs: vi.fn(), restoreJobs: vi.fn() }));

import { NOW, NZ, daysAgo, invoice, quote } from "../../_v2/lib/fixtures";
import {
  JOBS_ACTION_LIMIT,
  buildDeletedJobRows,
  buildJobRows,
  type BoardQuote,
  type DeletedJobRow,
  type JobRow,
} from "../../_v2/lib/job-board";
import { DeleteJobsSheet } from "./DeleteJobsSheet";
import { JobsBrowser, JobsList } from "./JobsBrowser";
import { JobsNotice, SelectBar } from "./SelectBars";

const html = (el: ReactElement) => renderToStaticMarkup(el);
const jobLinks = (markup: string) => markup.match(/<a [^>]*href="\/app\/quotes\/preview\//g) ?? [];

function board(): JobRow[] {
  return buildJobRows(
    [
      quote({ id: "bath", status: "draft", clientName: "Aroha Ngata", jobSummary: "Bathroom reline", createdAt: daysAgo(1) }),
      quote({ id: "gate", status: "sent", sentAt: daysAgo(4), clientName: "Mere Hohaia", jobSummary: "New gate" }),
      quote({ id: "fence", status: "completed", clientName: "Ben Walker", jobSummary: "Fence repair" }),
      quote({ id: "old", status: "declined", archived: true, clientName: "Kate Moss" }),
    ],
    [invoice("fence", { status: "sent", dueDate: daysAgo(9), total: 1240 })],
    NOW,
    NZ,
  );
}

function deletedBoard(): DeletedJobRow[] {
  const gone = (over: Partial<BoardQuote>, deletedAt: string) => ({ ...quote(over), deletedAt });
  return buildDeletedJobRows(
    [
      gone({ id: "deck", status: "completed", clientName: "Sam Taylor", jobSummary: "Deck at 14 Rata St" }, daysAgo(3)),
      gone({ id: "shed", status: "draft", clientName: "Tom Reid", jobSummary: "Garden shed", total: 2400 }, daysAgo(0.1)),
    ],
    [{ ...invoice("deck", { status: "paid", paidAt: daysAgo(5), total: 4830 }), deletedAt: daysAgo(3) }],
    NOW,
    NZ,
  );
}

beforeEach(() => {
  url.search = "";
});

describe("JobsBrowser: Select and the way to Recently deleted", () => {
  it("a Select button sits with the count under the filters; rows still open their job", () => {
    const out = html(<JobsBrowser rows={board()} deleted={[]} />);
    expect(out).toMatch(/data-testid="jobs-filters"[\s\S]*data-testid="jobs-count"[\s\S]*data-testid="jobs-select"/);
    expect(out).toMatch(/<button [^>]*data-testid="jobs-select"[^>]*>[\s\S]*?<span>Select<\/span><\/button>/);
    expect(jobLinks(out)).toHaveLength(4);
    expect(out).not.toContain('role="checkbox"');
    // Nothing deleted: no way in, no bar, an empty message region.
    expect(out).not.toContain("Recently deleted");
    expect(out).not.toContain('data-testid="jobs-select-bar"');
    expect(out).toMatch(/<div role="status" aria-live="polite" data-testid="jobs-notice"[^>]*><\/div>/);
  });

  it("Archived reads in the muted colour, not the faint one", () => {
    const out = html(<JobsBrowser rows={board()} />);
    expect(out).toContain('<span class="text-ui-xs text-ui-muted">Archived</span>');
    expect(out).not.toContain("text-ui-faint\">Archived");
  });

  it("with deleted jobs, Recently deleted waits under the list", () => {
    const out = html(<JobsBrowser rows={board()} deleted={deletedBoard()} />);
    expect(out).toMatch(/data-testid="jobs-list"[\s\S]*data-testid="jobs-deleted-entry"/);
    expect(out).toContain(">Recently deleted</span>");
    expect(out).toContain("2 jobs from the last 90 days");
  });

  it("when they couldn't be read, the way in is still there", () => {
    const out = html(<JobsBrowser rows={board()} deleted={null} />);
    expect(out).toContain("Jobs you deleted in the last 90 days");
  });

  it("everything deleted: No jobs yet, and Recently deleted to get them back", () => {
    const out = html(<JobsBrowser rows={[]} deleted={deletedBoard()} />);
    expect(out).toMatch(/<h2 [^>]*>No jobs yet<\/h2>/);
    expect(out).toContain('data-testid="jobs-deleted-entry"');
    expect(out).not.toContain('data-testid="jobs-select"');
  });
});

describe("Recently deleted (?show=deleted)", () => {
  it("newest first, when each went, a Restore button each, and no job pages", () => {
    url.search = "show=deleted";
    const out = html(<JobsBrowser rows={board()} deleted={deletedBoard()} />);
    expect(out).toContain('data-testid="jobs-deleted-view"');
    expect(out).toMatch(/<h2 [^>]*>Recently deleted<\/h2>/);
    expect(out).toContain(">Back to jobs</span>");
    expect(out).not.toContain('data-testid="jobs-filters"');
    expect(jobLinks(out)).toHaveLength(0);
    expect(out.indexOf(">Tom Reid<")).toBeLessThan(out.indexOf(">Sam Taylor<"));
    expect(out).toContain(">Deleted today</span>");
    expect(out).toContain(">Deleted 3 days ago</span>");
    expect(out).toContain('aria-label="Restore Sam Taylor, Deck at 14 Rata St"');
    expect(out.match(/<span>Restore<\/span>/g)).toHaveLength(2);
    expect(out).toContain("$4,830.00");
    expect(out).toContain(">2 jobs</p>");
    expect(out).toContain('data-testid="jobs-select"');
  });

  it("nothing there: says so, with the way back", () => {
    url.search = "show=deleted";
    const out = html(<JobsBrowser rows={board()} deleted={[]} />);
    expect(out).toMatch(/<h2 [^>]*>Nothing deleted<\/h2>/);
    expect(out).toContain("Jobs you delete show here for 90 days, so you can put them back.");
  });

  it("couldn't read them: says so, with Try again", () => {
    url.search = "show=deleted";
    const out = html(<JobsBrowser rows={board()} deleted={null} />);
    expect(out).toContain("Couldn&#x27;t load your deleted jobs");
    expect(out).toMatch(/<a [^>]*href="\/app\/jobs\?show=deleted"/);
  });

  it("without deleted jobs to show (older callers), it is the normal list", () => {
    url.search = "show=deleted";
    const out = html(<JobsBrowser rows={board()} />);
    expect(out).not.toContain('data-testid="jobs-deleted-view"');
    expect(jobLinks(out)).toHaveLength(4);
  });
});

describe("select mode rows", () => {
  it("each row is one tick box (role checkbox), never a box inside a link", () => {
    const out = html(<JobsList rows={board()} selecting selected={new Set(["gate"])} onToggle={() => {}} />);
    expect(jobLinks(out)).toHaveLength(0);
    expect(out).not.toContain("<a ");
    expect(out.match(/role="checkbox"/g)).toHaveLength(4);
    expect(out.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(out.match(/aria-checked="false"/g)).toHaveLength(3);
    expect(out).toMatch(/role="checkbox" aria-checked="true" tabindex="0" data-testid="job-select-row" data-job="gate" class="[^"]*bg-ui-brand-soft/);
    // A visible tick box: filled when ticked, empty when not.
    expect(out.match(/aria-hidden="true" data-tone="brand"/g)).toHaveLength(1);
    expect(out.match(/aria-hidden="true" data-tone="neutral"/g)).toHaveLength(3);
    // Still says who, what and where it's at.
    expect(out).toContain(">Mere Hohaia</span>");
    expect(out).toContain(">Waiting for Mere</span>");
    expect(out).toContain("$1,240.00");
    expect(out).toContain("min-h-16");
  });

  it("deleted rows tick too, instead of their Restore buttons", () => {
    const out = html(<JobsList rows={deletedBoard()} selecting selected={new Set()} onToggle={() => {}} />);
    expect(out.match(/role="checkbox"/g)).toHaveLength(2);
    expect(out).not.toContain("<span>Restore</span>");
    expect(out).toContain(">Deleted today</span>");
  });

  it(`at the limit (${JOBS_ACTION_LIMIT}) the unticked rows can't be ticked`, () => {
    const out = html(<JobsList rows={board()} selecting selected={new Set(["bath"])} atLimit onToggle={() => {}} />);
    expect(out.match(/aria-disabled="true"/g)).toHaveLength(3);
    expect(out).toMatch(/aria-checked="true"(?![^>]*aria-disabled)/);
  });
});

describe("the docked bars", () => {
  it("Delete 3 jobs, above the tab bar", () => {
    const out = html(<SelectBar count={3} action="delete" onAction={() => {}} />);
    expect(out).toContain("bottom-[calc(5.3rem_+_env(safe-area-inset-bottom))]");
    expect(out).toContain("sm:bottom-0");
    expect(out).toContain("animate-ui-toast-in motion-reduce:animate-none");
    expect(out).toMatch(/data-testid="jobs-delete" data-variant="danger"/);
    expect(out).toContain("<span>Delete 3 jobs</span>");
    expect(html(<SelectBar count={1} action="delete" onAction={() => {}} />)).toContain("<span>Delete 1 job</span>");
  });

  it("Restore 3 in Recently deleted; says when the limit is reached", () => {
    const out = html(<SelectBar count={3} action="restore" onAction={() => {}} />);
    expect(out).toContain("<span>Restore 3</span>");
    expect(out).toContain('data-variant="primary"');
    const full = html(<SelectBar count={JOBS_ACTION_LIMIT} action="delete" atLimit onAction={() => {}} />);
    expect(full).toContain(`That&#x27;s the most you can do at once (${JOBS_ACTION_LIMIT}).`);
  });

  it("a restore that failed says why on the bar, above the button", () => {
    const out = html(<SelectBar count={2} action="restore" error="Couldn't restore those jobs." onAction={() => {}} />);
    expect(out).toMatch(/<div role="alert">[\s\S]*Couldn&#x27;t restore those jobs\.[\s\S]*<span>Restore 2<\/span>/);
  });

  it("after a delete: what happened, with Undo", () => {
    const out = html(
      <JobsNotice
        notice={{ id: 1, tone: "info", message: "3 jobs deleted", undo: ["a", "b", "c"] }}
        onUndo={() => {}}
        onDismiss={() => {}}
      />,
    );
    expect(out).toMatch(/role="status" aria-live="polite"/);
    expect(out).toContain(">3 jobs deleted</p>");
    expect(out).toMatch(/data-testid="jobs-undo"[^>]*>[\s\S]*?<span>Undo<\/span>/);
    expect(out).toContain("<span>OK</span>");
    expect(out).toContain("bottom-[calc(5.3rem_+_env(safe-area-inset-bottom))]");
    const restored = html(
      <JobsNotice notice={{ id: 2, tone: "ok", message: "3 jobs restored" }} onUndo={() => {}} onDismiss={() => {}} />,
    );
    expect(restored).not.toContain("Undo");
  });
});

describe("the check before deleting", () => {
  const picked = () => board().filter((r) => ["bath", "gate", "fence"].includes(r.id));

  it("Delete 3 jobs? what happens, the invoice and link warnings, Delete or Keep", () => {
    const out = html(<DeleteJobsSheet open rows={picked()} onConfirm={() => {}} onClose={() => {}} />);
    expect(out).toContain(">Delete 3 jobs?</h2>");
    expect(out).toContain(
      "They&#x27;re removed from Jobs and your totals. You can restore them from Recently deleted.",
    );
    expect(out).toContain("1 has an invoice you&#x27;ve already sent or been paid for.");
    expect(out).toContain("Clients can&#x27;t open these quotes any more.");
    expect(out).toMatch(/data-testid="jobs-delete-confirm" data-variant="danger"[^>]*>[\s\S]*?<span>Delete 3 jobs<\/span>/);
    expect(out).toContain("<span>Keep them</span>");
  });

  it("two already billed of three", () => {
    const rows = picked().map((r) => (r.id === "gate" ? { ...r, invoiceStatus: "paid" as const } : r));
    const out = html(<DeleteJobsSheet open rows={rows} onConfirm={() => {}} onClose={() => {}} />);
    expect(out).toContain("2 have invoices you&#x27;ve already sent or been paid for.");
  });

  it("drafts only: no warnings", () => {
    const drafts = board().filter((r) => r.id === "bath");
    const out = html(<DeleteJobsSheet open rows={drafts} onConfirm={() => {}} onClose={() => {}} />);
    expect(out).toContain(">Delete this job?</h2>");
    expect(out).not.toContain('data-tone="warn"');
    expect(out).toContain("<span>Keep it</span>");
  });

  it("a server error stays in the sheet", () => {
    const out = html(
      <DeleteJobsSheet open rows={picked()} error="Couldn't delete those jobs." onConfirm={() => {}} onClose={() => {}} />,
    );
    expect(out).toMatch(/<div role="alert">[\s\S]*Couldn&#x27;t delete those jobs\./);
  });

  it("closed: nothing inside the dialog", () => {
    expect(html(<DeleteJobsSheet open={false} rows={picked()} onConfirm={() => {}} onClose={() => {}} />)).toMatch(
      /^<dialog [^>]*><\/dialog>$/,
    );
  });
});
