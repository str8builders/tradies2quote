"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUp,
  ChatCircleDots,
  ShieldCheck,
  X,
} from "@phosphor-icons/react";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";

/**
 * CustomerChat — Wave 36 — "The Quote That Sells Itself".
 *
 * A chat on the public quote view. The tradie's customer (no T2Q account)
 * opens the quote, taps "Ask about this quote", and gets an AI assistant
 * that knows the quote, the tradie's pricing rules, and what's negotiable.
 *
 * Architecture:
 *   - This is a pure client component.
 *   - POSTs to /api/quote/[token]/chat with { message }
 *   - The endpoint persists the conversation server-side in
 *     quote_data.chat_history so the tradie can review it later, and uses
 *     that stored copy (never one sent from the browser) as the context.
 *   - History also lives in component state for instant rendering.
 *
 * UX notes:
 *   - Launcher: a labelled pill, bottom-right, above the iOS home indicator.
 *   - Opens as a bottom sheet on phones, a floating panel on sm+.
 *   - The first message says who the assistant speaks for; a few ready
 *     questions help the customer start. On phones the keyboard stays down
 *     until they tap the box, so those stay in view.
 *   - First load fetches no history — the customer always starts a fresh
 *     conversation. Past chats are still persisted so the tradie can see
 *     them; the customer doesn't need to revisit them.
 *   - Polite fallback if the agent fails. Customer never sees a 500.
 *   - Kept for App Review: the AI notice (5.1.2) and the Report control (1.2).
 */

const TOKEN_KEY_PREFIX = "t2q-chat-seen-";

/** The API's own limit (route MAX_MESSAGE_LEN). */
const MAX_MESSAGE_LENGTH = 1000;

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

/** Questions customers ask most, one tap to send. */
export const STARTER_QUESTIONS = [
  "What's included in the price?",
  "When could you start?",
  "Could anything change the price?",
  "How do I accept the quote?",
] as const;

/** "SB" for "STR8 BUILDERS"; null when there's no usable name. */
export function initialsOf(name: string | null): string | null {
  const words = (name ?? "").split(/\s+/).filter((w) => /^[\p{L}\p{N}]/u.test(w));
  const letters = words.slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return letters || null;
}

/** The assistant's first message: who it speaks for, and what to ask. */
export function welcomeMessage(businessName: string | null, clientName: string | null): string {
  const tradie = businessName?.trim() || "the team";
  const first = clientName?.trim().split(/\s+/)[0];
  const greeting = first ? `Hi ${first}, I'm` : "Hi, I'm";
  return `${greeting} the quote assistant for ${tradie}. Ask me anything about this quote: what's included, timing, options or the terms. If I can't answer, I'll pass your question on to ${tradie}.`;
}

export function CustomerChat({ token, businessName, clientName }: Props) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => [
    { role: "assistant", content: welcomeMessage(businessName, clientName) },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hintVisible, setHintVisible] = useState(false);
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent">(
    "idle",
  );

  const titleId = useId();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const launcherRef = useRef<HTMLButtonElement | null>(null);
  const tradie = businessName?.trim() || null;
  const initials = initialsOf(tradie);

  // The page behind stays put while the chat is open (and, on iPhone, comes
  // back in place once the keyboard has gone).
  useBodyScrollLock(open);

  // Tiny hint that nudges customers to open the chat. Shows on the first
  // page load only, then fades after 9s.
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

  // Keep the newest message in view.
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending, error, open]);

  // On open: remember it for this quote, and focus the box on a computer
  // (on a phone the keyboard would cover the welcome and the questions).
  useEffect(() => {
    if (!open) return;
    try {
      window.sessionStorage.setItem(`${TOKEN_KEY_PREFIX}${token}`, "1");
    } catch {
      /* private mode */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hide hint when chat opens
    setHintVisible(false);
    const finePointer = window.matchMedia?.("(pointer: fine)").matches ?? false;
    const t = setTimeout(() => {
      if (finePointer) inputRef.current?.focus();
    }, 100);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, token]);

  // The box grows with what's typed, up to about five lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
  }, [input, open]);

  // Closed: focus goes back to the button that opened it (no scroll: the
  // page is being put back where it was).
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !open) launcherRef.current?.focus({ preventScroll: true });
    wasOpen.current = open;
  }, [open]);

  function close() {
    setOpen(false);
  }

  /** Send what's in the box, or one of the ready questions. */
  async function sendMessage(question?: string) {
    const trimmed = (question ?? input).trim();
    if (!trimmed || sending) return;
    setError(null);

    const customerMsg: Message = { role: "customer", content: trimmed };
    setMessages((prev) => [...prev, customerMsg]);
    if (question === undefined) setInput("");
    setSending(true);

    try {
      const res = await fetch(
        `/api/quote/${encodeURIComponent(token)}/chat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
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
            "Sorry, the assistant couldn't be reached. Try again in a moment.",
        );
        return;
      }
      const reply = data.reply ?? "Thanks, I'll pass that on.";
      setMessages((prev) => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setError("No connection. Check your internet and try again.");
    } finally {
      setSending(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; shift+enter inserts a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
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
      setError("Couldn't send the report. Try again.");
    }
  }

  const showStarters =
    !sending && !error && messages.every((m) => m.role === "assistant");

  return (
    <>
      {/* Launcher, bottom-right, clear of the iOS home indicator. */}
      <div
        className="fixed right-4 bottom-4 z-40 flex flex-col items-end sm:right-6 sm:bottom-6"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {!open && hintVisible && (
          <div
            data-testid="customer-chat-hint"
            className="mb-3 max-w-[16.5rem] rounded-2xl border border-white/10 bg-ink-950/95 px-4 py-3 text-left shadow-[0_18px_40px_-16px_rgba(0,0,0,0.9)] backdrop-blur"
          >
            <p className="text-sm font-semibold text-white">
              Questions about this quote?
            </p>
            <p className="mt-0.5 text-sm leading-snug text-ink-300">
              Ask here and get an answer in seconds.
            </p>
          </div>
        )}
        {/* Hidden while the chat is open (it would show through the fade). */}
        <button
          ref={launcherRef}
          hidden={open}
          type="button"
          onClick={() => setOpen(true)}
          data-testid="customer-chat-launcher"
          aria-haspopup="dialog"
          aria-expanded={open}
          className="inline-flex h-12 items-center gap-2 rounded-full bg-brand pr-5 pl-4 text-[15px] font-semibold text-ink-950 shadow-[0_14px_34px_-12px_rgba(255,95,21,0.75)] ring-1 ring-black/10 transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white motion-reduce:transition-none motion-reduce:hover:translate-y-0"
        >
          <ChatCircleDots size={22} weight="fill" aria-hidden="true" />
          Ask about this quote
        </button>
      </div>

      {/* Bottom sheet on phones, floating panel on sm+. `overflow-hidden`
          on the backdrop keeps every descendant (the composer and its Send
          button included) inside the visible viewport on iOS, even when the
          page itself is wider (PDF iframe, wide tables). */}
      {open && (
        <div
          data-testid="customer-chat-sheet"
          className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-black/60 backdrop-blur-[2px] animate-ui-fade-in motion-reduce:animate-none sm:justify-end sm:p-6"
          onClick={close}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => e.stopPropagation()}
            className="flex h-[min(88dvh,46rem)] w-full max-w-md flex-col overflow-hidden rounded-t-[1.75rem] border border-white/10 bg-ink-950 shadow-[0_-18px_60px_-20px_rgba(0,0,0,0.9)] animate-ui-sheet-in motion-reduce:animate-none sm:h-[min(80dvh,46rem)] sm:rounded-[1.75rem]"
          >
            <div aria-hidden="true" className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-white/15 sm:hidden" />

            {/* Who's answering */}
            <header className="flex items-center gap-3 px-5 pt-3 pb-4 sm:pt-5">
              <Avatar initials={initials} size="lg" />
              <div className="min-w-0 flex-1">
                <h2
                  id={titleId}
                  className="ui-title truncate text-[17px] leading-tight text-white"
                >
                  {tradie ?? "Quote assistant"}
                </h2>
                <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-300">
                  <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {tradie ? "Quote assistant · replies in seconds" : "Replies in seconds"}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close chat"
                data-testid="customer-chat-close"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/5 text-ink-200 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-brand"
              >
                <X size={18} weight="bold" aria-hidden="true" />
              </button>
            </header>

            <p className="mx-5 flex items-start gap-2 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 text-[13px] leading-snug text-ink-300">
              <ShieldCheck size={16} weight="fill" aria-hidden="true" className="mt-px shrink-0 text-brand" />
              <span>
                Answers come from this quote. Any change to the price is up to{" "}
                {tradie ?? "the tradie"}.
              </span>
            </p>

            {/* Messages */}
            <div
              ref={scrollRef}
              data-testid="customer-chat-messages"
              aria-live="polite"
              className="flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4"
            >
              {messages.map((m, i) => (
                <Bubble
                  key={i}
                  role={m.role}
                  content={m.content}
                  initials={initials}
                  withAvatar={m.role === "assistant" && messages[i - 1]?.role !== "assistant"}
                />
              ))}
              {showStarters && (
                <div className="flex flex-wrap gap-2 pt-1 pl-10" data-testid="customer-chat-starters">
                  {STARTER_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => void sendMessage(q)}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-2 text-left text-sm text-ink-100 hover:border-brand/60 hover:text-white focus-visible:outline-2 focus-visible:outline-brand"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
              {sending && <TypingBubble initials={initials} />}
              {error && (
                <p
                  role="alert"
                  data-testid="customer-chat-error"
                  className="ml-10 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-sm leading-snug text-red-200"
                >
                  {error}
                </p>
              )}
            </div>

            {/* Composer */}
            <footer className="border-t border-white/5 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),0.75rem)]">
              {/* `min-w-0` on the row AND the textarea: without it the
                  textarea's min-content (the long placeholder) can push the
                  Send button off-screen on narrow phones. */}
              <div className="flex min-w-0 items-end gap-2 rounded-2xl border border-white/10 bg-ink-900 p-1.5 pl-4 focus-within:border-brand/60">
                <label htmlFor={`${titleId}-input`} className="sr-only">
                  Your question
                </label>
                <textarea
                  id={`${titleId}-input`}
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Ask a question about this quote"
                  data-testid="customer-chat-input"
                  rows={1}
                  maxLength={MAX_MESSAGE_LENGTH}
                  enterKeyHint="send"
                  className="max-h-[8.25rem] min-h-10 min-w-0 flex-1 resize-none bg-transparent py-2 text-base leading-6 text-white outline-none placeholder:text-ink-500"
                />
                <button
                  type="button"
                  // Keep the focus (and the phone's keyboard) in the box, as a chat should.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void sendMessage()}
                  disabled={!input.trim() || sending}
                  data-testid="customer-chat-send"
                  aria-label="Send message"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-ink-950 hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-ink-500"
                >
                  <ArrowUp size={18} weight="bold" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-2 flex items-start justify-between gap-3 px-1">
                {/* 5.1.2 AI disclosure — the customer must know they're
                    talking to an AI and that messages are processed by our
                    AI provider + shared with the tradie. */}
                <p className="text-xs leading-snug text-ink-500">
                  AI assistant, so answers can be wrong. {tradie ?? "The tradie"} can
                  read this chat.
                </p>
                <button
                  type="button"
                  onClick={reportChat}
                  disabled={reportState !== "idle"}
                  data-testid="customer-chat-report"
                  className="shrink-0 text-xs text-ink-400 underline underline-offset-2 hover:text-red-300 disabled:no-underline disabled:opacity-70"
                >
                  {reportState === "sent"
                    ? "Reported"
                    : reportState === "sending"
                      ? "Reporting…"
                      : "Report"}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}

function Avatar({ initials, size }: { initials: string | null; size: "lg" | "sm" }) {
  const box = size === "lg" ? "h-11 w-11 text-[15px]" : "h-7 w-7 text-[11px]";
  return (
    <span
      aria-hidden="true"
      className={`relative inline-flex shrink-0 items-center justify-center rounded-full bg-linear-to-br from-brand to-[#c2410c] font-bold tracking-tight text-ink-950 ${box}`}
    >
      {initials ?? <ChatCircleDots size={size === "lg" ? 20 : 14} weight="fill" />}
      {size === "lg" ? (
        <span className="absolute -right-0.5 -bottom-0.5 h-3 w-3 rounded-full border-2 border-ink-950 bg-emerald-400" />
      ) : null}
    </span>
  );
}

function Bubble({
  role,
  content,
  initials,
  withAvatar,
}: Message & { initials: string | null; withAvatar: boolean }) {
  const isCustomer = role === "customer";
  return (
    <div
      data-testid={`customer-chat-bubble-${role}`}
      className={`flex items-end gap-2 ${isCustomer ? "justify-end" : "justify-start"}`}
    >
      {!isCustomer ? (
        withAvatar ? <Avatar initials={initials} size="sm" /> : <span aria-hidden="true" className="w-7 shrink-0" />
      ) : null}
      <div
        className={[
          // Wave 38 — break-words on the bubble itself; without it a long
          // URL or unbroken string can blow the bubble past 85% width,
          // pushing the chat wider and the Send button off screen on
          // narrow iPhones. min-w-0 lets the bubble shrink under flex
          // pressure; break-words wraps mid-token when there's no
          // whitespace to break on.
          "max-w-[85%] min-w-0 rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed break-words whitespace-pre-wrap",
          isCustomer
            ? "rounded-br-md bg-brand text-ink-950"
            : "rounded-bl-md border border-white/5 bg-ink-800 text-ink-100",
        ].join(" ")}
      >
        <span className="sr-only">{isCustomer ? "You: " : "Assistant: "}</span>
        {content}
      </div>
    </div>
  );
}

function TypingBubble({ initials }: { initials: string | null }) {
  return (
    <div data-testid="customer-chat-typing" className="flex items-end gap-2">
      <Avatar initials={initials} size="sm" />
      <div className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-white/5 bg-ink-800 px-4 py-3.5">
        <span className="sr-only">The assistant is typing</span>
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
      className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ink-300 motion-reduce:animate-none"
      style={{ animationDelay: delay }}
    />
  );
}
