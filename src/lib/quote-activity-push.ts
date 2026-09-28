import "server-only";
import { after } from "next/server";
import { sendPushToUser, type PushPayload } from "@/lib/push";
import { sanitizeForPush } from "@/lib/moderation";
import { consumeFixedWindow } from "@/lib/rate-limit";
import { isPlaceholderClientName, quoteNumber } from "@/lib/quote-defaults";

/**
 * Buzzes for the tradie when their client does something on the quote link:
 * the first time they open it, and when they send a message in the chat.
 * (Accepting has its own, in the accept route.)
 *
 * Best-effort by construction: the send starts straight away but is never
 * awaited by the client's request, sendPushToUser never throws, and push is
 * a no-op for a tradie with no phone subscribed (the only notification
 * setting there is — Settings → Quote notifications, per phone).
 */

/** At most one chat buzz per quote in this window. */
export const CHAT_PUSH_GAP_MS = 15 * 60_000;

type QuoteForPush = {
  id: string;
  created_at: string;
  client?: { name?: string | null } | null;
  job_summary?: string | null;
};

/** "Sam" from "Sam Taylor"; null for blanks and "To be confirmed". */
function firstName(name: string | null | undefined): string | null {
  const clean = sanitizeForPush(name, 80);
  if (!clean || isPlaceholderClientName(clean)) return null;
  return clean.split(" ")[0] || null;
}

/** The job in a few words: the summary's first phrase, else the quote number. */
function jobWords(quote: QuoteForPush): string {
  const summary = (quote.job_summary ?? "").replace(/\s+/g, " ").trim();
  const phrase = (summary.split(/(?<!\d)[.!?](?=\s|$)|\s[–—-]\s|;/)[0] ?? "").trim();
  const clean = sanitizeForPush(phrase, 60);
  return clean || `Quote ${quoteNumber(quote.id, quote.created_at)}`;
}

/** "Sam opened your quote" — the first time the client opens the link. */
export function quoteOpenedPush(quote: QuoteForPush): PushPayload {
  const who = firstName(quote.client?.name);
  return {
    title: `${who ?? "Your client"} opened your quote`,
    body: jobWords(quote),
    url: `/app/quotes/preview/${quote.id}`,
    tag: `quote-opened-${quote.id}`,
  };
}

/** "Sam sent a message" with what they wrote, cut short. */
export function clientMessagePush(quote: QuoteForPush, message: string): PushPayload {
  const who = firstName(quote.client?.name);
  return {
    title: `${who ?? "Your client"} sent a message`,
    body: sanitizeForPush(message, 100) || "Open the quote to read it.",
    url: `/app/quotes/preview/${quote.id}`,
    tag: `quote-chat-${quote.id}`,
  };
}

/**
 * Whose quote was just opened for the first time, from mark_quote_viewed.
 * The function returns { quote_id, user_id } only for the call that recorded
 * the first view (migration 20260929_mark_quote_viewed_result.sql); before
 * that migration it returns nothing, and no buzz is sent.
 */
export function firstViewFromRpc(data: unknown): { quoteId: string; userId: string } | null {
  if (!data || typeof data !== "object") return null;
  const row = data as { quote_id?: unknown; user_id?: unknown };
  return typeof row.quote_id === "string" && typeof row.user_id === "string"
    ? { quoteId: row.quote_id, userId: row.user_id }
    : null;
}

/** True when this chat message may buzz the tradie (at most one per quote per 15 minutes). */
export function takeChatPushSlot(quoteId: string): boolean {
  return consumeFixedWindow(`push:quote-chat:${quoteId}`, 1, CHAT_PUSH_GAP_MS).ok;
}

/**
 * Send a buzz without holding up the client's request: it starts now, and
 * `after` keeps the work alive past the response where the platform needs it.
 */
export function pushInBackground(userId: string, payload: PushPayload): void {
  let job: Promise<void>;
  try {
    job = Promise.resolve(sendPushToUser(userId, payload)).catch(() => {});
  } catch {
    return; // sendPushToUser never throws; belt and braces for the client's request
  }
  try {
    after(() => job);
  } catch {
    // Outside a request (tests, scripts): it is already running.
  }
}
