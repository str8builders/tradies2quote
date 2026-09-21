"use client";

import { AI_CONSENT_VERSION } from "@/lib/ai-disclosure";
import { useEffect, useRef, useState } from "react";
import {
  ChatCircle,
  PaperPlaneRight,
  X,
} from "@phosphor-icons/react";

/**
 * CustomerChat — Wave 36 — "The Quote That Sells Itself".
 *
 * A floating chat bubble that lives at the bottom-right of the
 * public quote view. The tradie's customer (no T2Q account) opens
 * the quote, taps the bubble, and gets an AI sales assistant that
 * knows the quote, the tradie's pricing rules, and what's negotiable.
 *
 * Architecture:
 *   - This is a pure client component.
 *   - POSTs to /api/quote/[token]/chat with { message, history }
 *   - The endpoint persists the conversation server-side in
 *     quote_data.chat_history so the tradie can review it later.
 *   - History also lives in component state for instant rendering.
 *
 * UX notes:
 *   - Bubble is brand-orange, bottom-right, above the iOS home indicator.
 *   - Opens a full-screen sheet on mobile (<sm), centered panel on sm+.
 *   - First-load fetches no history — the customer always starts a
 *     fresh conversation. Past chats are still persisted so the tradie
 *     can see them; the customer doesn't need to revisit them.
 *   - Polite fallback if the agent fails. Customer never sees a 500.
 */

const TOKEN_KEY_PREFIX = "t2q-chat-seen-";

type Message = {
  role: "customer" | "assistant";
  content: string;
};

type Props = {
  /** The quote's public token, taken from the page params. */
  token: string;
  /** Tradie business name for the welcome line. Optional. */
  businessName: string | null;
  /** Customer's name from the quote, for personalised welcome. */
  clientName: string | null;
};

const MAX_HISTORY_FOR_API = 20;

export function CustomerChat({ token, businessName, clientName }: Props) {
  const [open, setOpen] = useState(false);
  const [aiAllowed, setAiAllowed] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSeenWelcome, setHasSeenWelcome] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent">(
    "idle",
  );

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // First-load: drop a friendly welcome message into the chat so the
  // customer immediately sees the bot can talk. Won't re-show on
  // subsequent opens within the same session.
  useEffect(() => {
    if (hasSeenWelcome) return;
    const tradie = businessName ?? "the team";
    const name = clientName ? clientName.split(" ")[0] : "there";
    const welcome: Message = {
      role: "assistant",
      content: `Hi ${name}! I'm the T2Q assistant for ${tradie}. Ask me anything about this quote — line items, alternatives, timing, terms — and I'll answer using the actual numbers above. If I can't answer, I'll flag it for ${tradie} directly.`,
    };
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time welcome seed gated by hasSeenWelcome
    setMessages([welcome]);
    setHasSeenWelcome(true);
  }, [hasSeenWelcome, businessName, clientName]);

  // Tiny hint bubble that nudges customers to tap the chat. Shows on
  // first page load only, then fades after 8s.
  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(`${TOKEN_KEY_PREFIX}${token}`))
        return;
    } catch {
      /* private mode */
    }
    const t = setTimeout(() => setHintVisible(true), 1500);
    const t2 = setTimeout(() => setHintVisible(false), 1500 + 9000);
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [token]);

  // Auto-scroll to the bottom whenever a new message lands.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  // Auto-focus the input when the sheet opens.
  useEffect(() => {
    if (open) {
      try {
        window.sessionStorage.setItem(`${TOKEN_KEY_PREFIX}${token}`, "1");
      } catch {
        /* private mode */
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hide hint when chat opens
      setHintVisible(false);
      // Defer so the sheet has time to mount + animate.
      const t = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(t);
    }
  }, [open, token]);

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || sending || !aiAllowed) return;
    setError(null);

    const customerMsg: Message = { role: "customer", content: trimmed };
    const nextMessages = [...messages, customerMsg];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    // Send up to N prior turns for context, but only the back-and-forth
    // (skip the auto-welcome greeting — model doesn't need to see it).
    const historyForApi = nextMessages
      .slice(1) // drop welcome
      .slice(-MAX_HISTORY_FOR_API);

    try {
      const res = await fetch(
        `/api/quote/${encodeURIComponent(token)}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            aiConsentVersion: AI_CONSENT_VERSION,
            message: trimmed,
            history: historyForApi.slice(0, -1), // exclude the message we just sent
          }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reply?: string;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(
          data.message ??
            "Sorry — couldn't reach the assistant. Try again in a moment.",
        );
        setSending(false);
        return;
      }
      const reply = data.reply ?? "Thanks — I'll pass that on.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; shift+enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // Guideline 1.2 — report control. One tap + confirm flags the whole
  // conversation to the operator (reviewed within 24 hours).
  async function reportChat() {
    if (reportState !== "idle") return;
    const confirmed = window.confirm(
      "Report this chat as offensive or inappropriate? The Tradies2Quote team reviews reports within 24 hours.",
    );
    if (!confirmed) return;
    setReportState("sending");
    try {
      const lastAssistant = [...messages]
        .reverse()
        .find((m) => m.role === "assistant");
      await fetch(`/api/quote/${encodeURIComponent(token)}/chat/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: "reported_from_chat_ui",
          messagePreview: lastAssistant?.content.slice(0, 300) ?? null,
        }),
      });
      setReportState("sent");
    } catch {
      setReportState("idle");
      setError("Couldn't send the report — try again.");
    }
  }

  return (
    <>
      {/* Floating launcher pinned bottom-right. Above the home indicator
          on iOS via the safe-area inset. */}
      <div
        className="fixed z-40 right-4 bottom-4 sm:right-6 sm:bottom-6"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {hintVisible && !open && (
          <div
            data-testid="customer-chat-hint"
            className="mb-2 ml-auto max-w-[16rem] rounded-sm border border-brand/40 bg-ink-950/95 px-3 py-2 text-right shadow-lg backdrop-blur-sm"
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
              {"// got a question?"}
            </p>
            <p className="mt-0.5 text-xs text-ink-200">
              Tap to chat about this quote.
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          data-testid="customer-chat-launcher"
          aria-label="Open chat about this quote"
          className="inline-flex h-14 w-14 items-center justify-center rounded-full border-2 border-ink-900 bg-brand text-ink-900 shadow-[0_10px_30px_-8px_rgba(255,95,21,0.6)] transition-transform hover:scale-105"
        >
          <ChatCircle size={26} weight="fill" />
        </button>
      </div>

      {/* Full-screen sheet on mobile, panel on sm+.
          `overflow-hidden` on the backdrop is the real fix for the
          Send-button-off-screen bug: `fixed inset-0` anchors the
          backdrop to the visible viewport, and `overflow-hidden`
          forces every descendant (the sheet, the footer, the flex
          row, the Send button) to fit inside it. Previously the
          sheet's `max-w-[min(28rem,100vw)]` could resolve wider than
          the visible viewport on iOS when document-width exceeded
          viewport-width (PDF iframe, wide tables, etc.), and the
          Send button would land off the right edge. */}
      {open && (
        <div
          data-testid="customer-chat-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Chat about this quote"
          className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-black/70 backdrop-blur-sm sm:items-end sm:justify-end sm:p-6"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            // w-full + max-w-md scoped to the backdrop (which is exactly
            // viewport-sized thanks to fixed inset-0 + overflow-hidden
            // above), so the sheet never exceeds visible width. No
            // more 100vw arithmetic that the iOS quirk can mess with.
            className="flex h-[88vh] w-full max-w-md flex-col overflow-hidden overflow-x-hidden rounded-t-2xl border border-ink-700 bg-ink-950 shadow-2xl sm:h-[80vh] sm:rounded-2xl"
          >
            {/* Header */}
            <header className="flex items-start justify-between gap-3 border-b border-ink-700 bg-ink-950 px-5 py-4">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">
                  {"// t2q · chat about this quote"}
                </p>
                <h2 className="mt-0.5 font-display text-base uppercase tracking-tight text-white sm:text-lg">
                  T2Q
                </h2>
                <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
                  {businessName
                    ? `${businessName} · answers in seconds · won't change pricing without the tradie`
                    : "Answers in seconds · won't change pricing without the tradie"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close chat"
                data-testid="customer-chat-close"
                className="-mr-1 -mt-1 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-400 hover:text-white"
              >
                <X size={16} weight="bold" />
              </button>
            </header>

            {/* Message list */}
            <div
              ref={scrollRef}
              data-testid="customer-chat-messages"
              className="flex-1 space-y-3 overflow-y-auto overflow-x-hidden bg-ink-900 px-4 py-4"
            >
              {messages.map((m, i) => (
                <Bubble key={i} role={m.role} content={m.content} />
              ))}
              {sending && <TypingBubble />}
              {error && (
                <p
                  data-testid="customer-chat-error"
                  className="rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
                >
                  {error}
                </p>
              )}
            </div>

            {/* Composer */}
            <footer className="border-t border-ink-700 bg-ink-950 px-3 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
              <label className="mb-3 flex items-start gap-2 text-xs text-ink-300">
                <input type="checkbox" checked={aiAllowed} onChange={(e) => setAiAllowed(e.target.checked)} className="h-5 w-5 shrink-0 accent-brand" />
                <span>Allow Anthropic to process this conversation and quote details to answer my questions. Processing may occur overseas. AI can make mistakes; the tradie can see this chat. <a href="/privacy" className="underline">Privacy Policy</a></span>
              </label>
              {/* `min-w-0` on the inner flex AND the textarea is the
                  classic flexbox-shrink fix: without it, the textarea's
                  intrinsic min-content (sized to the long placeholder
                  string) pushes the 44px Send button off-screen on
                  narrow phones. With it, the textarea collapses to fill
                  whatever's left after the button takes its 44px. */}
              <div className="flex min-w-0 items-end gap-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Ask anything about this quote…"
                  data-testid="customer-chat-input"
                  rows={1}
                  className="min-h-[44px] max-h-32 min-w-0 flex-1 resize-none rounded-sm border border-ink-600 bg-ink-900 px-3 py-2.5 text-sm text-white placeholder:text-ink-500 outline-none focus:border-brand"
                />
                <button
                  type="button"
                  onClick={sendMessage}
                  disabled={!input.trim() || sending || !aiAllowed}
                  data-testid="customer-chat-send"
                  aria-label="Send message"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-brand text-ink-900 hover:bg-hivis disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <PaperPlaneRight size={18} weight="bold" />
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                {/* 5.1.2 AI disclosure — the customer must know they're
                    talking to an AI and that messages are processed by our
                    AI provider + shared with the tradie. */}
                <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink-500">
                  {"// ai assistant · answers may contain mistakes · the tradie sees this chat"}
                </p>
                <button
                  type="button"
                  onClick={reportChat}
                  disabled={reportState !== "idle"}
                  data-testid="customer-chat-report"
                  className="shrink-0 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-500 underline underline-offset-2 hover:text-red-300 disabled:no-underline disabled:opacity-70"
                >
                  {reportState === "sent"
                    ? "Reported ✓"
                    : reportState === "sending"
                      ? "Reporting…"
                      : "Report"}
                </button>
              </div>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

function Bubble({ role, content }: Message) {
  const isCustomer = role === "customer";
  return (
    <div
      data-testid={`customer-chat-bubble-${role}`}
      className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}
    >
      <div
        className={[
          // Wave 38 — break-words on the bubble itself; without it a
          // long URL or unbroken-string in a customer message can blow
          // the bubble past 85% width, pushing the chat body wider,
          // pushing the sheet wider, pushing the Send button off
          // screen on narrow iPhones. min-w-0 lets the bubble shrink
          // under flex pressure; break-words wraps mid-token when
          // there's no whitespace to break on.
          "max-w-[85%] min-w-0 whitespace-pre-wrap break-words rounded-md px-3 py-2 text-sm",
          isCustomer
            ? "bg-brand text-ink-900"
            : "bg-ink-800 text-ink-100 border border-ink-700",
        ].join(" ")}
      >
        {content}
      </div>
    </div>
  );
}

function TypingBubble() {
  return (
    <div
      data-testid="customer-chat-typing"
      className="flex justify-start"
      aria-label="Assistant is typing"
    >
      <div className="inline-flex items-center gap-1.5 rounded-md border border-ink-700 bg-ink-800 px-3 py-2.5">
        <Dot delay="0ms" />
        <Dot delay="160ms" />
        <Dot delay="320ms" />
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ink-300"
      style={{ animationDelay: delay }}
    />
  );
}
