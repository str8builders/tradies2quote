import {
  ChatCircle,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import type { QuoteData } from "@/lib/quote-types";
import { ChatModerationControls } from "./ChatModerationControls";

/**
 * CustomerChatPanel — Wave 36 — read-only tradie view of the
 * "Quote That Sells Itself" customer-side chat thread.
 *
 * Lives inside the ReviewToolsSheet on the quote preview page. Reads
 * the persisted history from `quote_data.chat_history` (written by
 * /api/quote/[token]/chat) and renders:
 *
 *   1. Any `note_to_tradie` items the AI flagged during the chat —
 *      shown prominently at the top so the tradie sees actionable
 *      requests (cheaper alternative, scope change, etc.) without
 *      scrolling the full thread.
 *
 *   2. The full message-by-message conversation, oldest first.
 *
 * Server component — pure rendering of already-fetched data. No
 * client-side fetch, no live updates. The tradie refreshes the page
 * to see new messages (rare enough on a beta trial).
 */

type ChatHistoryEntry = {
  role: "customer" | "assistant";
  content: string;
  timestamp: string;
  intent?: string;
  note_to_tradie?: string;
};

function extractChatHistory(quoteData: QuoteData | null): ChatHistoryEntry[] {
  if (!quoteData) return [];
  const raw = (quoteData as { chat_history?: unknown }).chat_history;
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is ChatHistoryEntry => {
    if (!e || typeof e !== "object") return false;
    const v = e as Partial<ChatHistoryEntry>;
    return (
      (v.role === "customer" || v.role === "assistant") &&
      typeof v.content === "string" &&
      typeof v.timestamp === "string"
    );
  });
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-NZ", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export function CustomerChatPanel({
  quoteData,
  quoteId,
  chatDisabled = false,
}: {
  quoteData: QuoteData | null;
  quoteId: string;
  chatDisabled?: boolean;
}) {
  const history = extractChatHistory(quoteData);

  if (history.length === 0) {
    return (
      <div className="space-y-3">
        <ChatModerationControls quoteId={quoteId} chatDisabled={chatDisabled} />
        <div
          data-testid="customer-chat-empty"
          className="rounded-sm border border-ink-700 bg-ink-900/30 p-4 text-sm text-ink-300"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
            {"// no customer chat yet"}
          </p>
          <p className="mt-1.5">
            Once the customer opens this quote, they can tap the chat
            bubble in the bottom-right corner and ask questions. T2Q
            answers using the actual quote numbers, flags anything that
            needs your input, and never agrees to a price change without
            you. Their conversation will appear here.
          </p>
        </div>
      </div>
    );
  }

  const customerCount = history.filter((m) => m.role === "customer").length;
  const notes = history
    .map((m, i) => ({ note: m.note_to_tradie, index: i, role: m.role }))
    .filter(
      (n): n is { note: string; index: number; role: "customer" | "assistant" } =>
        typeof n.note === "string" && n.note.length > 0,
    );

  return (
    <div className="space-y-4">
      <ChatModerationControls quoteId={quoteId} chatDisabled={chatDisabled} />
      {/* Summary header */}
      <div className="flex items-center gap-2 rounded-sm border border-brand/30 bg-brand/5 px-3 py-2">
        <ChatCircle size={16} weight="bold" className="text-brand" />
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
          {`// ${customerCount} customer message${customerCount === 1 ? "" : "s"}`}
        </p>
        {notes.length > 0 && (
          <span
            data-testid="customer-chat-notes-count"
            className="ml-auto inline-flex items-center gap-1 rounded-sm border border-hivis/40 bg-hivis/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-hivis"
          >
            <WarningCircle size={10} weight="bold" />
            {`${notes.length} note${notes.length === 1 ? "" : "s"} for you`}
          </span>
        )}
      </div>

      {/* Pending notes — only when present */}
      {notes.length > 0 && (
        <div
          data-testid="customer-chat-notes"
          className="rounded-sm border border-hivis/40 bg-hivis/10 p-3"
        >
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-hivis">
            {"// chat flagged these for you"}
          </p>
          <ul className="mt-2 space-y-2 text-sm text-ink-100">
            {notes.map((n) => (
              <li key={n.index} className="flex gap-2">
                <span aria-hidden="true" className="text-hivis">
                  →
                </span>
                <span>{n.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Full thread, oldest first */}
      <ol
        data-testid="customer-chat-thread"
        className="space-y-2.5"
      >
        {history.map((m, i) => {
          const isCustomer = m.role === "customer";
          return (
            <li
              key={i}
              className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}
            >
              <div
                className={[
                  "max-w-[88%] rounded-md px-3 py-2 text-sm",
                  isCustomer
                    ? "bg-brand/15 border border-brand/30 text-white"
                    : "bg-ink-800 border border-ink-700 text-ink-100",
                ].join(" ")}
              >
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-400">
                  {isCustomer ? "Customer" : "T2Q assistant"} ·{" "}
                  {formatTime(m.timestamp)}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{m.content}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
