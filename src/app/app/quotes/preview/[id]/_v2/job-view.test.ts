import { describe, expect, it } from "vitest";
import { railProgress, railStates } from "@/components/ui/lib/job-stages";
import { OWNER_TRANSITIONS, STAGES } from "@/lib/lifecycle/stages";
import type { InvoiceStatus } from "@/lib/types/invoice";
import { jobView, type JobInvoiceState, type JobViewInput } from "./job-view";

const base: JobViewInput = {
  status: "draft",
  generated: true,
  clientFirstName: "Sam",
  pastExpiry: false,
  invoice: null,
};

const invoice = (status: InvoiceStatus, extra: Partial<JobInvoiceState> = {}): JobInvoiceState => ({
  status,
  number: "INV-0012",
  dueOn: "2 Oct",
  daysLate: 0,
  paidOn: null,
  ...extra,
});

const view = (patch: Partial<JobViewInput>) => jobView({ ...base, ...patch });

/** Rail states read left to right, e.g. "done done current upcoming upcoming upcoming". */
const rail = (patch: Partial<JobViewInput>) =>
  railStates(view(patch).position)
    .map((s) => s.state)
    .join(" ");

describe("job view: rail position, next step and words for every status", () => {
  it("while the quote is being written: the Quote step, no button", () => {
    const v = view({ generated: false });
    expect(v.position).toBe("Quote");
    expect(v.next.kind).toBe("generating");
    expect(v.hint).toMatch(/Writing your quote/);
  });

  it("draft: Quote done, Sent is next, the big button sends to the client by first name", () => {
    const v = view({ status: "draft" });
    expect(v.position).toBe("Sent");
    expect(rail({ status: "draft" })).toBe("done current upcoming upcoming upcoming upcoming");
    expect(v.next).toEqual({ kind: "send", label: "Send to Sam" });
    expect(v.secondary).toBeNull();
    expect(v.hint).toBe("Next: send it to Sam.");
    expect(v.locked).toBe(false);
  });

  it("draft with no client name says 'Send the quote'", () => {
    expect(view({ status: "draft", clientFirstName: null }).next.label).toBe("Send the quote");
  });

  it.each([
    ["no-lines", "Next: add what's in the job, then send it."],
    ["no-client", "Next: add who the quote is for, then send it."],
    ["no-contact", "Next: add Sam's email or mobile, then send it."],
    ["check", "Next: check the flagged lines, then send it."],
    ["unpriced", "Next: add your prices, then send it to Sam."],
  ] as const)("draft blocked by %s says what to fix first", (draftBlocker, hint) => {
    const v = view({ status: "draft", draftBlocker });
    expect(v.hint).toBe(hint);
    expect(v.next.kind).toBe("send");
  });

  it("sent: waiting on a yes; remind is the big button, 'They said yes' the second", () => {
    const v = view({ status: "sent", dates: { sentOn: "22 Sept" } });
    expect(v.position).toBe("Accepted");
    expect(rail({ status: "sent" })).toBe("done done current upcoming upcoming upcoming");
    expect(v.next).toEqual({ kind: "remind", label: "Send a reminder" });
    expect(v.secondary).toEqual({ kind: "accept", label: "They said yes" });
    expect(v.hint).toBe("Sent 22 Sept. Waiting for Sam to say yes.");
    expect(v.stateLabel).toBe("Sent 22 Sept");
  });

  it("viewed: says the client opened it", () => {
    const v = view({ status: "viewed", dates: { viewedOn: "23 Sept" } });
    expect(v.position).toBe("Accepted");
    expect(v.next.kind).toBe("remind");
    expect(v.secondary?.kind).toBe("accept");
    expect(v.hint).toBe("Sam opened it 23 Sept. Waiting for a yes.");
    expect(view({ status: "viewed", clientFirstName: null }).hint).toBe("Your client has opened it. Waiting for a yes.");
  });

  it("offers 'They said yes' only where the owner transitions allow it", () => {
    for (const status of STAGES) {
      const secondary = view({ status }).secondary;
      const allowed = OWNER_TRANSITIONS[status].includes("accepted");
      expect(secondary?.kind === "accept", status).toBe(allowed);
    }
  });

  it("accepted: book the job", () => {
    const v = view({ status: "accepted", dates: { acceptedOn: "24 Sept" } });
    expect(v.position).toBe("Booked");
    expect(rail({ status: "accepted" })).toBe("done done done current upcoming upcoming");
    expect(v.next).toEqual({ kind: "book", label: "Book the job" });
    expect(v.hint).toBe("Sam said yes on 24 Sept. Next: book a day for the job.");
    expect(v.locked).toBe(true);
  });

  it("scheduled: Booked done, start the job", () => {
    const v = view({ status: "scheduled", dates: { bookedFor: "Tue, 30 Sept" } });
    expect(v.position).toBe("Done");
    expect(rail({ status: "scheduled" })).toBe("done done done done current upcoming");
    expect(v.next).toEqual({ kind: "start", label: "Start the job" });
    expect(v.hint).toBe("Booked for Tue, 30 Sept. Next: start the job on the day.");
  });

  it("in progress: Booked done with 'Job started', then Job done", () => {
    const v = view({ status: "in_progress" });
    expect(v.position).toBe("Done");
    expect(v.stateLabel).toBe("Job started");
    expect(v.hint).toMatch(/^Job started\./);
    expect(v.next).toEqual({ kind: "finish", label: "Job done" });
  });

  it("completed with no invoice: send the invoice", () => {
    const v = view({ status: "completed" });
    expect(v.position).toBe("Paid");
    expect(rail({ status: "completed" })).toBe("done done done done done current");
    expect(v.next).toEqual({ kind: "invoice", label: "Send invoice" });
    expect(v.secondary).toBeNull();
  });

  it("completed with a cancelled invoice reads like no invoice", () => {
    expect(view({ status: "completed", invoice: invoice("cancelled") }).next.kind).toBe("invoice");
  });

  it("completed with a draft invoice: send it, or mark it paid for cash on the day", () => {
    const v = view({ status: "completed", invoice: invoice("draft") });
    expect(v.position).toBe("Paid");
    expect(v.next).toEqual({ kind: "invoice", label: "Send invoice" });
    expect(v.secondary).toEqual({ kind: "invoice-paid", label: "Mark as paid" });
    expect(v.hint).toBe("Invoice INV-0012 is ready. Next: send it to Sam.");
  });

  it.each(["sent", "overdue"] as const)("completed with a %s invoice: mark as paid, plus a reminder", (status) => {
    const v = view({ status: "completed", invoice: invoice(status) });
    expect(v.position).toBe("Paid");
    expect(v.next).toEqual({ kind: "paid", label: "Mark as paid" });
    expect(v.secondary).toEqual({ kind: "invoice-remind", label: "Send a reminder" });
    expect(v.hint).toBe("Invoice sent. Due 2 Oct. Mark it paid when the money's in.");
  });

  it("a late invoice says how late", () => {
    const v = view({ status: "completed", invoice: invoice("overdue", { daysLate: 9 }) });
    expect(v.hint).toMatch(/^The invoice is 9 days late\./);
    expect(v.stateLabel).toBe("9 days late");
    expect(view({ status: "completed", invoice: invoice("sent", { daysLate: 1 }) }).stateLabel).toBe("1 day late");
  });

  it("paid: the whole rail is done and there is no button, just a calm paid state", () => {
    const v = view({ status: "completed", invoice: invoice("paid", { paidOn: "3 Oct" }) });
    expect(v.position).toBe("complete");
    expect(railProgress(v.position)).toBe(1);
    expect(rail({ status: "completed", invoice: invoice("paid") })).toBe("done done done done done done");
    expect(v.next.kind).toBe("none");
    expect(v.secondary).toBeNull();
    expect(v.hint).toBe("Paid on 3 Oct. All done.");
    expect(v.stateLabel).toBe("Paid 3 Oct");
  });

  it("declined: said no, with what to do next (change it and send it again)", () => {
    const v = view({ status: "declined" });
    expect(v.position).toBe("Accepted");
    expect(v.banner?.tone).toBe("bad");
    expect(v.banner?.title).toBe("Sam said no");
    expect(v.next).toEqual({ kind: "resend", label: "Send it again" });
    expect(v.hint).toBe("Next: change it if you like, then send it again.");
    expect(v.locked).toBe(false);
  });

  it("declined and past its expiry: sending again can't work, so start a new quote", () => {
    const v = view({ status: "declined", pastExpiry: true });
    expect(v.banner?.title).toBe("Sam said no");
    expect(v.next.kind).toBe("new-quote");
  });

  it.each([
    ["expired", false],
    ["sent", true],
    ["viewed", true],
  ] as const)("%s (past expiry: %s) shows it has run out and offers a new quote", (status, pastExpiry) => {
    const v = view({ status, pastExpiry, dates: { expiresOn: "12 Sept" } });
    expect(v.position).toBe("Accepted");
    expect(v.banner).toEqual({
      tone: "warn",
      title: "This quote has run out",
      body: "It ran out on 12 Sept, so Sam can't accept it any more.",
    });
    expect(v.next).toEqual({ kind: "new-quote", label: "Start a new quote" });
    expect(v.stateLabel).toBe("Ran out");
  });

  it("past expiry does not change a job that is already accepted or later", () => {
    expect(view({ status: "accepted", pastExpiry: true }).next.kind).toBe("book");
    expect(view({ status: "scheduled", pastExpiry: true }).next.kind).toBe("start");
    expect(view({ status: "completed", pastExpiry: true }).next.kind).toBe("invoice");
  });

  it("an unknown status fails closed: locked, no button", () => {
    const v = view({ status: "invoiced" });
    expect(v.locked).toBe(true);
    expect(v.next.kind).toBe("none");
    expect(v.secondary).toBeNull();
  });

  it("locked matches the post-acceptance lock for every status", () => {
    const expected: Record<string, boolean> = {
      draft: false,
      sent: false,
      viewed: false,
      declined: false,
      expired: false,
      accepted: true,
      scheduled: true,
      in_progress: true,
      completed: true,
    };
    for (const status of STAGES) expect(view({ status }).locked, status).toBe(expected[status]);
  });

  it("always has something to say about what's next", () => {
    const invoices = [null, ...(["draft", "sent", "overdue", "paid", "cancelled"] as const).map((s) => invoice(s))];
    for (const status of [...STAGES, "invoiced"]) {
      for (const inv of invoices) {
        for (const pastExpiry of [false, true]) {
          const v = view({ status, invoice: inv, pastExpiry });
          expect(v.hint.length, `${status}/${inv?.status}/${pastExpiry}`).toBeGreaterThan(10);
          expect(v.hint).not.toMatch(/\/\/|undefined|null/);
          if (v.next.kind !== "none") expect(v.next.label.length).toBeGreaterThan(3);
        }
      }
    }
  });
});
