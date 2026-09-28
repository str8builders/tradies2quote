import type { QuoteData } from "./quote-types";

/**
 * The customer chat (quote_data.chat_history) belongs to the public quote
 * link: /api/quote/[token]/chat appends to it atomically through
 * append_quote_chat_messages, and nothing else ever writes it. Every writer
 * that saves a whole quote_data (the job page, the classic editor, the size
 * check, the compliance answers, the transcript fix) works from a copy loaded
 * earlier, so writing that copy's chat back would wipe whatever the client
 * asked since, the assistant's reply and any note left for the tradie.
 *
 * `withStoredChatHistory` puts the stored row's chat on the quote about to be
 * written, whatever the incoming copy carried: the history exactly as stored,
 * or no chat key at all when the row has none. Pass the quote_data read from
 * the row in the same request, never one from the browser.
 */
export function withStoredChatHistory<T extends QuoteData>(next: T, stored: unknown): T {
  const { chat_history: _incoming, ...rest } = next;
  const kept =
    stored && typeof stored === "object" && !Array.isArray(stored)
      ? (stored as { chat_history?: unknown }).chat_history
      : undefined;
  return (kept === undefined || kept === null ? rest : { ...rest, chat_history: kept }) as T;
}
