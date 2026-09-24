/**
 * Sending a quote from the new job page: the same send gate and the same
 * routes as the classic page (POST /api/quotes/[id]/send and /sms, then
 * /sms/sent for a text sent from the tradie's own phone). This module only
 * decides what the sheet says. Pure: tested in node.
 *
 * The routes stay the authority. The pre-check runs the very same
 * validateQuoteForSending / validateQuoteForSmsSending on what the page is
 * about to save, so the tradie sees what's missing before tapping Send.
 */

import { BUSINESS_NAME_REQUIRED } from "@/lib/business-name";
import type { QuoteData } from "@/lib/quote-types";
import {
  assessQuoteTakeoffSafety,
  isUnpricedLine,
  normalizePhone,
  validateQuoteForSending,
  validateQuoteForSmsSending,
  type SendValidationError,
} from "@/lib/quote-validation";
import { realClientName } from "./job-title";
import type { DraftBlocker } from "./job-view";

export type SendChannel = "email" | "sms";

/** Plain words for every code the send routes and the gate return. */
const MESSAGES: Record<string, string> = {
  client_name_missing: "Add who the quote is for first.",
  client_email_missing: "Add an email address first.",
  client_email_invalid: "That email address doesn't look right. Check it first.",
  client_phone_missing: "Add a mobile number first.",
  client_phone_invalid: "That mobile number doesn't look right. Check it first.",
  no_line_items: "Add at least one line first.",
  total_zero: "Give at least one line a quantity first.",
  already_accepted: "This quote has already been accepted.",
  job_underway: "This job is already booked or underway, so the quote can't be sent again.",
  takeoff_blocked: "Some lines need fixing before this can go.",
  takeoff_unconfirmed: "Check these before you send.",
  [BUSINESS_NAME_REQUIRED.error]: "Add your business name first. It goes on the quote.",
  profile_unavailable: "We couldn't load your business details. Try again in a minute.",
  pdf_generation_failed: "We couldn't make the PDF. Try again in a minute.",
  pdf_upload_failed: "We couldn't save the PDF. Try again in a minute.",
  email_not_configured: "Email isn't working right now. Send a text instead, or try again soon.",
  email_from_not_configured: "Email isn't working right now. Send a text instead, or try again soon.",
  sms_not_configured: "Texting isn't working right now. Send it by email instead.",
  sms_token_not_configured: "Texting isn't working right now. Send it by email instead.",
  sms_from_not_configured: "Texting isn't working right now. Send it by email instead.",
  rate_limited: "You've sent a lot today. Try again tomorrow, or get in touch if you need more.",
  not_found: "We couldn't find this quote. Go back to your jobs and open it again.",
  unauthorized: "You've been signed out. Sign in again, then send it.",
};

/**
 * Plain words for a send error code. Unknown codes use the server's own
 * message when it gave one ("Email sent but couldn't update…").
 */
export function sendErrorMessage(code: string | null | undefined, serverMessage?: string | null): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (serverMessage && serverMessage.trim()) return serverMessage.trim();
  return "The quote didn't send. Check your signal and try again.";
}

/** What fixes a pre-check problem: the client sheet, the lines, or Settings. */
export type SendFix = "client" | "lines" | "settings" | null;

export function fixFor(code: string): SendFix {
  if (code.startsWith("client_")) return "client";
  if (code === "no_line_items" || code === "total_zero" || code === "takeoff_blocked") return "lines";
  if (code === BUSINESS_NAME_REQUIRED.error) return "settings";
  return null;
}

export type SendCheck =
  | { state: "ready"; to: string }
  /** Sendable after the tradie confirms these (includes $0 lines). */
  | { state: "confirm"; to: string; reasons: string[] }
  /** Can't be sent by any path until fixed. */
  | { state: "blocked"; reasons: string[] }
  | { state: "fix"; code: SendValidationError; message: string; fix: SendFix };

export interface SendCheckInput {
  status: string;
  data: QuoteData;
  /** voice_transcript ?? job_summary: the gate's contradiction evidence. */
  description: string | null;
}

/**
 * The send gate, run on the page before tapping Send. `to` is the address or
 * number the route will use.
 */
export function checkSend(channel: SendChannel, input: SendCheckInput): SendCheck {
  const args = {
    status: input.status,
    total_amount: input.data.total,
    quote_data: input.data,
    acknowledged: false,
    description: input.description,
  };
  const result = channel === "email" ? validateQuoteForSending(args) : validateQuoteForSmsSending(args);
  if (result.ok) return { state: "ready", to: "resolvedEmail" in result ? result.resolvedEmail : result.resolvedPhone };
  if (result.error === "takeoff_blocked") return { state: "blocked", reasons: result.reasons ?? [] };
  if (result.error === "takeoff_unconfirmed") {
    const acknowledged = channel === "email" ? validateQuoteForSending({ ...args, acknowledged: true }) : validateQuoteForSmsSending({ ...args, acknowledged: true });
    const to = acknowledged.ok ? ("resolvedEmail" in acknowledged ? acknowledged.resolvedEmail : acknowledged.resolvedPhone) : "";
    return { state: "confirm", to, reasons: result.reasons ?? [] };
  }
  return { state: "fix", code: result.error, message: sendErrorMessage(result.error), fix: fixFor(result.error) };
}

/**
 * The first thing stopping a draft going, in the order to fix it, for the
 * "what's next" line. The send sheet itself shows the gate's exact words.
 */
export function draftBlocker(data: QuoteData, description: string | null): DraftBlocker | null {
  const items = Array.isArray(data.line_items) ? data.line_items : [];
  if (items.length === 0) return "no-lines";
  if (!realClientName(data.client?.name)) return "no-client";
  if (!(data.client?.email ?? "").trim() && !(data.client?.phone ?? "").trim()) return "no-contact";
  if (!assessQuoteTakeoffSafety(data, { description }).can_send) return "check";
  if (items.some(isUnpricedLine)) return "unpriced";
  return null;
}

/** A usable mobile number for the text option, or null. */
export function textableNumber(phone: string | null | undefined): string | null {
  const normalized = normalizePhone(phone ?? "");
  return /^\+\d{8,15}$/.test(normalized) ? normalized : null;
}

export type SendOutcome =
  /** Sent by the platform (email, or a Twilio text): the quote is now sent. */
  | { kind: "sent"; channel: SendChannel }
  /** Text ready for the tradie's own Messages app; nothing sent yet. */
  | { kind: "device"; to: string; body: string; clientName: string }
  /** The gate wants these confirmed first ($0 lines, assumptions). */
  | { kind: "confirm"; reasons: string[] }
  | { kind: "blocked"; reasons: string[]; message: string }
  | { kind: "error"; code: string; message: string; fix: SendFix };

interface RouteBody {
  error?: string;
  message?: string;
  reasons?: string[];
  mode?: string;
  to?: string;
  body?: string;
  client_name?: string;
}

/** Read a send route's answer the way the classic StickyActionBar does. */
export function readSendResponse(channel: SendChannel, ok: boolean, body: unknown): SendOutcome {
  const data = (body && typeof body === "object" ? body : {}) as RouteBody;
  if (!ok) {
    const code = data.error ?? "send_failed";
    if (code === "takeoff_unconfirmed") return { kind: "confirm", reasons: data.reasons ?? [] };
    if (code === "takeoff_blocked") {
      return { kind: "blocked", reasons: data.reasons ?? [], message: sendErrorMessage(code, data.message) };
    }
    return { kind: "error", code, message: sendErrorMessage(code, data.message), fix: fixFor(code) };
  }
  if (channel === "sms" && data.mode === "device" && data.to && data.body) {
    return { kind: "device", to: data.to, body: data.body, clientName: data.client_name ?? "your client" };
  }
  return { kind: "sent", channel };
}

/** The toast once a quote has gone. */
export function sentMessage(channel: SendChannel, firstName: string | null): string {
  const to = firstName ? ` to ${firstName}` : "";
  return channel === "email" ? `Quote emailed${to}` : `Quote texted${to}`;
}

/**
 * Where the send sheet points first: email when the address is good, else a
 * text when that works, else email (its pre-check says what to add).
 */
export function preferredChannel(email: SendCheck, text: SendCheck | null): SendChannel {
  const usable = (check: SendCheck | null) => !!check && (check.state === "ready" || check.state === "confirm");
  if (usable(email)) return "email";
  if (usable(text)) return "sms";
  return "email";
}

const REASONS: Array<[RegExp, (n: number, list: string) => string]> = [
  [
    /^(\d+) line\(s\) have no price set and will quote at \$0: (.+?)\. Add a price or confirm it's intentional before sending\.$/,
    (n, list) => (n === 1 ? `${list} has no price, so it will show as $0.` : `${n} lines have no price, so they will show as $0: ${list}.`),
  ],
  [
    /^(\d+) material line\(s\) use an AI-estimated quantity that must be confirmed before sending: (.+?)\.$/,
    (n, list) => `We estimated the quantity for ${list}. Check ${n === 1 ? "it" : "them"} first.`,
  ],
  [
    /^(\d+) line\(s\) couldn't be calculated and need more info: (.+?)\.$/,
    (n, list) => `${list} ${n === 1 ? "needs a size before it" : "need sizes before they"} can be worked out.`,
  ],
  [/^(\d+) line\(s\) flagged for review: (.+?)\.$/, (_n, list) => `Have another look at ${list}.`],
  [
    /^(\d+) line\(s\) used default assumptions: (.+?)\.$/,
    (n, list) => `${list} ${n === 1 ? "was" : "were"} worked out with some guesses.`,
  ],
  [
    /^(\d+) line\(s\) no longer match the supplier quote: (.+?)\. Snap to the supplier value or correct the price\.$/,
    (n, list) => `${list} no longer ${n === 1 ? "matches" : "match"} the supplier's quote. Fix it in the detailed editor.`,
  ],
];

/**
 * The send gate's reasons in plainer words ("Joist hangers has no price, so
 * it will show as $0."), keeping every name and number. Wording the gate adds
 * later still shows, with its "line(s)" tidied.
 */
export function plainReason(reason: string): string {
  const text = reason.trim();
  for (const [pattern, say] of REASONS) {
    const match = pattern.exec(text);
    if (match) return say(Number(match[1]), match[2]);
  }
  const sizes = /^Confirm the key dimensions read off the drawing before sending: (.+?)(?: \([^)]*\))?\.$/.exec(text);
  if (sizes) return `Check the sizes we read off your drawing: ${sizes[1]}.`;
  // "2 blocked line(s) carry…" → "2 blocked lines carry…"; "1 line(s)" → "1 line".
  return text.replace(/\b(\d+)((?:\s+[a-z]+)*?\s+[a-z]+)\(s\)/gi, (_all, n: string, words: string) =>
    n === "1" ? `${n}${words}` : `${n}${words}s`,
  );
}

/** Where a channel would send: the client's email, or their mobile in full. */
export function channelAddress(channel: SendChannel, data: QuoteData): string | null {
  if (channel === "sms") return textableNumber(data.client?.phone);
  return (data.client?.email ?? "").trim() || null;
}
