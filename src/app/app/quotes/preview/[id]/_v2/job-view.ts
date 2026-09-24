/**
 * What the job page shows for a quote's state: where the progress line is,
 * the one big next-step button, an optional second button, and a line of
 * plain words saying what happens next. Pure: every status and invoice
 * combination is unit-tested in node.
 *
 * The rail's `position` is the step the job is waiting on — the step the big
 * orange button completes (see components/ui/lib/job-stages.ts).
 *
 * Transitions come from the lifecycle rules (OWNER_TRANSITIONS); this module
 * only decides which of them to offer and how to word it.
 */

import type { RailPosition } from "@/components/ui/status-rail";
import { canTransition } from "@/lib/lifecycle/stages";
import { isQuoteLocked } from "@/lib/lifecycle/lock";
import type { QuoteStatus } from "@/lib/quote-types";
import type { InvoiceStatus } from "@/lib/types/invoice";

export type NextStepKind =
  /** The quote is still being written: no button. */
  | "generating"
  /** draft → the send sheet. */
  | "send"
  /** declined → the send sheet again. */
  | "resend"
  /** sent / viewed → the reminder sheet. */
  | "remind"
  /** The quote ran out: a fresh quote is the way forward. */
  | "new-quote"
  | "book"
  | "start"
  | "finish"
  /** Make (if needed) and send the invoice. */
  | "invoice"
  | "paid"
  /** Paid, or a status this page does not know: nothing to press. */
  | "none";

export type SecondaryStepKind = "accept" | "invoice-remind" | "invoice-paid";

export interface NextStep {
  kind: NextStepKind;
  label: string;
}

export interface SecondaryStep {
  kind: SecondaryStepKind;
  label: string;
}

export interface JobBanner {
  tone: "bad" | "warn" | "ok";
  title: string;
  body: string;
}

export interface JobInvoiceState {
  status: InvoiceStatus;
  number: string;
  /** "2 Oct" */
  dueOn: string | null;
  /** Whole days past the due date while unpaid; 0 or null when not late. */
  daysLate: number | null;
  /** "3 Oct" */
  paidOn: string | null;
}

/** Why a draft can't go yet, in the order the tradie should fix things. */
export type DraftBlocker = "no-lines" | "no-client" | "no-contact" | "check" | "unpriced";

export interface JobViewInput {
  /** quotes.status as stored (unknown values are handled, not trusted). */
  status: string;
  /** quote_data has line items (false while the quote is being written). */
  generated: boolean;
  clientFirstName: string | null;
  /** Past its expiry date (or status "expired"), so the client can't accept. */
  pastExpiry: boolean;
  invoice: JobInvoiceState | null;
  draftBlocker?: DraftBlocker | null;
  dates?: {
    sentOn?: string | null;
    viewedOn?: string | null;
    acceptedOn?: string | null;
    /** "Tue, 30 Sept" */
    bookedFor?: string | null;
    expiresOn?: string | null;
  };
}

export interface JobView {
  position: RailPosition;
  /** What happens next, in words, under the progress line. */
  hint: string;
  /** Short state for the total card ("Sent 22 Sept"). */
  stateLabel: string;
  banner: JobBanner | null;
  next: NextStep;
  secondary: SecondaryStep | null;
  /** Lines, prices and client details can't change (post-acceptance lock). */
  locked: boolean;
}

const KNOWN: ReadonlySet<string> = new Set<QuoteStatus>([
  "draft",
  "sent",
  "viewed",
  "accepted",
  "scheduled",
  "in_progress",
  "completed",
  "declined",
  "expired",
]);

function withDate(text: string, date: string | null | undefined, joiner = " "): string {
  return date ? `${text}${joiner}${date}` : text;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The client's first name for buttons, or "your client". */
function who(first: string | null): string {
  return first ?? "your client";
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function draftHint(blocker: DraftBlocker | null | undefined, first: string | null): string {
  switch (blocker) {
    case "no-lines":
      return "Next: add what's in the job, then send it.";
    case "no-client":
      return "Next: add who the quote is for, then send it.";
    case "no-contact":
      return `Next: add ${first ? `${first}'s` : "your client's"} email or mobile, then send it.`;
    case "check":
      return "Next: check the flagged lines, then send it.";
    case "unpriced":
      return `Next: add your prices, then send it to ${who(first)}.`;
    default:
      return `Next: send it to ${who(first)}.`;
  }
}

function sendLabel(first: string | null): string {
  return first ? `Send to ${first}` : "Send the quote";
}

/** Whether the owner may record a verbal "yes" from this status. */
function acceptStep(status: string): SecondaryStep | null {
  return KNOWN.has(status) && canTransition(status as QuoteStatus, "accepted")
    ? { kind: "accept", label: "They said yes" }
    : null;
}

function invoiceView(invoice: JobInvoiceState | null, first: string | null): Omit<JobView, "locked"> {
  if (!invoice || invoice.status === "cancelled") {
    return {
      position: "Paid",
      hint: "Job done. Next: send the invoice.",
      stateLabel: "Done",
      banner: null,
      next: { kind: "invoice", label: "Send invoice" },
      secondary: null,
    };
  }
  if (invoice.status === "paid") {
    return {
      position: "complete",
      hint: invoice.paidOn ? `Paid on ${invoice.paidOn}. All done.` : "Paid. All done.",
      stateLabel: withDate("Paid", invoice.paidOn),
      banner: null,
      next: { kind: "none", label: "Paid" },
      secondary: null,
    };
  }
  if (invoice.status === "draft") {
    return {
      position: "Paid",
      hint: `Invoice ${invoice.number} is ready. Next: send it to ${who(first)}.`,
      stateLabel: "Invoice not sent",
      banner: null,
      next: { kind: "invoice", label: "Send invoice" },
      // Cash on the day: a draft can be marked paid without emailing it.
      secondary: { kind: "invoice-paid", label: "Mark as paid" },
    };
  }
  // sent / overdue
  const late = invoice.daysLate && invoice.daysLate > 0 ? invoice.daysLate : 0;
  return {
    position: "Paid",
    hint: late
      ? `The invoice is ${plural(late, "day", "days")} late. Send a reminder, or mark it paid when the money's in.`
      : invoice.dueOn
        ? `Invoice sent. Due ${invoice.dueOn}. Mark it paid when the money's in.`
        : "Invoice sent. Mark it paid when the money's in.",
    stateLabel: late ? `${plural(late, "day", "days")} late` : "Invoice sent",
    banner: null,
    next: { kind: "paid", label: "Mark as paid" },
    secondary: { kind: "invoice-remind", label: "Send a reminder" },
  };
}

export function jobView(input: JobViewInput): JobView {
  const { status, clientFirstName: first, invoice } = input;
  const dates = input.dates ?? {};
  const locked = isQuoteLocked(status);

  if (!input.generated) {
    return {
      position: "Quote",
      hint: "Writing your quote. This usually takes under a minute.",
      stateLabel: "Writing",
      banner: null,
      next: { kind: "generating", label: "Writing your quote" },
      secondary: null,
      locked,
    };
  }

  const expired =
    status === "expired" ||
    (input.pastExpiry && (status === "sent" || status === "viewed" || status === "declined"));

  if (status === "declined") {
    return {
      position: "Accepted",
      hint: expired
        ? "Next: start a new quote if they want to go ahead."
        : "Next: change it if you like, then send it again.",
      stateLabel: "Declined",
      banner: {
        tone: "bad",
        title: `${capital(who(first))} said no`,
        body: expired
          ? "This quote has also run out, so sending it again won't work. Start a new one if they change their mind."
          : "If they might go ahead with changes, change the price or the lines, then send it again.",
      },
      next: expired
        ? { kind: "new-quote", label: "Start a new quote" }
        : { kind: "resend", label: "Send it again" },
      secondary: null,
      locked,
    };
  }

  if (expired) {
    return {
      position: "Accepted",
      hint: "Next: start a new quote with fresh dates.",
      stateLabel: "Ran out",
      banner: {
        tone: "warn",
        title: "This quote has run out",
        body: input.dates?.expiresOn
          ? `It ran out on ${input.dates.expiresOn}, so ${who(first)} can't accept it any more.`
          : `${capital(who(first))} can't accept it any more.`,
      },
      next: { kind: "new-quote", label: "Start a new quote" },
      secondary: acceptStep(status),
      locked,
    };
  }

  switch (status) {
    case "draft":
      return {
        position: "Sent",
        hint: draftHint(input.draftBlocker, first),
        stateLabel: "Draft",
        banner: null,
        next: { kind: "send", label: sendLabel(first) },
        secondary: null,
        locked,
      };
    case "sent":
      return {
        position: "Accepted",
        hint: dates.sentOn
          ? `Sent ${dates.sentOn}. Waiting for ${who(first)} to say yes.`
          : `Waiting for ${who(first)} to say yes.`,
        stateLabel: withDate("Sent", dates.sentOn),
        banner: null,
        next: { kind: "remind", label: "Send a reminder" },
        secondary: acceptStep(status),
        locked,
      };
    case "viewed":
      return {
        position: "Accepted",
        hint: dates.viewedOn
          ? `${capital(who(first))} opened it ${dates.viewedOn}. Waiting for a yes.`
          : `${capital(who(first))} has opened it. Waiting for a yes.`,
        stateLabel: withDate("Opened", dates.viewedOn),
        banner: null,
        next: { kind: "remind", label: "Send a reminder" },
        secondary: acceptStep(status),
        locked,
      };
    case "accepted":
      return {
        position: "Booked",
        hint: dates.acceptedOn
          ? `${capital(who(first))} said yes on ${dates.acceptedOn}. Next: book a day for the job.`
          : `${capital(who(first))} said yes. Next: book a day for the job.`,
        stateLabel: withDate("Accepted", dates.acceptedOn),
        banner: null,
        next: { kind: "book", label: "Book the job" },
        secondary: null,
        locked,
      };
    case "scheduled":
      return {
        position: "Done",
        hint: dates.bookedFor
          ? `Booked for ${dates.bookedFor}. Next: start the job on the day.`
          : "Booked. Next: start the job on the day.",
        stateLabel: withDate("Booked", dates.bookedFor),
        banner: null,
        next: { kind: "start", label: "Start the job" },
        secondary: null,
        locked,
      };
    case "in_progress":
      return {
        position: "Done",
        hint: "Job started. Tap Job done when it's finished.",
        stateLabel: "Job started",
        banner: null,
        next: { kind: "finish", label: "Job done" },
        secondary: null,
        locked,
      };
    case "completed":
      return { ...invoiceView(invoice, first), locked };
    default:
      // A status this page doesn't know (fail closed: no button, locked).
      return {
        position: "Done",
        hint: `This job is marked "${status}".`,
        stateLabel: status,
        banner: null,
        next: { kind: "none", label: "" },
        secondary: null,
        locked,
      };
  }
}
