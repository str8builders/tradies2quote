import { type NextRequest, NextResponse } from "next/server";
import { captureError } from "@/lib/observability";
import { adminClient } from "@/lib/supabase/admin";
import { runCustomerChat } from "@/lib/agents/customer-chat";
import { storedChatHistoryForAgent } from "@/lib/agents/customer-chat-history";
import { moderateChatText } from "@/lib/moderation";
import type { PublicQuotePayload, QuoteData } from "@/lib/quote-types";
import { consumeDailyQuota, tooManyRequestsResponse } from "@/lib/rate-limit";

// Same derivation the accept route uses (accept/route.ts:24-30).
function clientIp(request: NextRequest): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}

/**
 * POST /api/quote/[token]/chat — Wave 36.
 *
 * Public, anonymous (no auth). The tradie's customer (who has no
 * T2Q account) opens their quote at /quote/[token], taps the chat
 * bubble, and POSTs messages here.
 *
 * Validation:
 *   - The token must resolve to a quote in 'sent' or 'viewed' status
 *     via the existing get_quote_by_token RPC. Drafts, declined,
 *     accepted, and expired quotes refuse chat.
 *   - Chat message length capped at 1000 chars.
 *   - Rate limit: 10 chat turns per public_token per UTC day.
 *   - Conversation context is the server-stored chat_history only (capped);
 *     any history the browser sends is ignored, so assistant turns cannot
 *     be forged.
 *
 * Persistence: chat history lives in `quotes.quote_data.chat_history`
 * as an append-only JSON array. We chose this over the `quote_events`
 * table because that table's `type` column is a Postgres enum locked
 * to lifecycle statuses (sent/viewed/accepted/declined/expired);
 * adding "chat" to the enum needs a manual SQL migration the trial
 * doesn't have time for. The JSON field is additive on an existing
 * column — zero migration, ships tonight, and `get_quote_by_token`
 * already strips quote_data from the customer's response by design.
 *
 * Each chat history entry shape:
 *   { role: "customer" | "assistant", content, timestamp, intent?,
 *     note_to_tradie?: string }
 *
 * The tradie's preview page reads this array to render the chat
 * thread + surface any pending noteToTradie items (Phase 5).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The private CPU-only model may need several minutes, especially if another
// request is already using its single slot. Keep the platform declaration
// above that bounded local-model timeout.
export const maxDuration = 1800;

const MAX_MESSAGE_LEN = 1000;
const MAX_MESSAGES_PER_DAY = 10;

type Params = { token: string };

type ChatBody = {
  message?: unknown;
};

type ChatHistoryEntry = {
  role: "customer" | "assistant";
  content: string;
  timestamp: string;
  intent?: string;
  note_to_tradie?: string;
};

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<Params> },
) {
  const { token } = await ctx.params;
  if (!token || typeof token !== "string") {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }

  // Per-IP fixed-window guard (UTC day), in addition to the per-token/day
  // 10-message cap enforced below. Generous cap so corporate-NAT /
  // one-office-many-customers traffic isn't throttled; it only trips on a
  // scripted loop hammering this endpoint.
  const ipForLimit = clientIp(request) ?? "unknown";
  const chatQuota = consumeDailyQuota(`quote-chat:${ipForLimit}`, 100);
  if (!chatQuota.ok) {
    return tooManyRequestsResponse(chatQuota.resetAt);
  }

  let body: ChatBody;
  try {
    body = (await request.json()) as ChatBody;
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const message =
    typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json(
      { error: "message_required" },
      { status: 400 },
    );
  }
  if (message.length > MAX_MESSAGE_LEN) {
    return NextResponse.json(
      { error: "message_too_long", limit: MAX_MESSAGE_LEN },
      { status: 413 },
    );
  }

  const admin = adminClient();

  // Fetch the quote via the same RPC the public page uses. RLS-safe
  // by construction (this RPC strips PII the customer shouldn't see).
  const { data, error } = await admin.rpc(
    "get_quote_by_token",
    { p_token: token } as never,
  );
  if (error || !data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const quote = data as PublicQuotePayload;

  // Gate: only chat on live quotes. Drafts shouldn't be chattable
  // (they aren't sent yet), accepted/declined/expired quotes are
  // terminal — chat there would imply the deal is still open.
  if (quote.status !== "sent" && quote.status !== "viewed") {
    return NextResponse.json(
      { error: "quote_not_chatting", status: quote.status },
      { status: 409 },
    );
  }

  // Fetch the underlying quote_data so we can read + append the
  // chat history. Admin client because the customer is anonymous.
  const { data: row, error: rowErr } = await admin
    .from("quotes")
    .select("id, quote_data, chat_disabled")
    .eq("id", quote.id)
    .single();
  if (rowErr || !row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  // Guideline 1.2 "block" control: the tradie can switch the chat off for
  // this quote link (the customer is an anonymous token-holder, so per-quote
  // disable IS the block mechanism). The public page also hides the chat UI
  // when disabled; this server check is the enforcement.
  if ((row as { chat_disabled?: boolean }).chat_disabled === true) {
    return NextResponse.json(
      {
        error: "chat_disabled",
        message: `Chat is turned off for this quote. Contact ${quote.business_email ?? "the tradie"} directly.`,
      },
      { status: 403 },
    );
  }

  // Guideline 1.2 "filter" control, inbound: screen the customer's message
  // BEFORE it reaches the model or is persisted for the tradie. Blocked
  // content gets a polite in-chat response (not an error) and is dropped.
  const inboundVerdict = await moderateChatText(message, "inbound");
  if (!inboundVerdict.allowed) {
    return NextResponse.json({
      ok: true,
      reply:
        "Let's keep this chat about the quote. That message isn't something I can pass on — feel free to rephrase, or contact the tradie directly.",
      noteToTradie: null,
      moderated: true,
    });
  }
  const quoteData = (row.quote_data ?? {}) as QuoteData & {
    chat_history?: ChatHistoryEntry[];
  };
  const existingHistory: ChatHistoryEntry[] = Array.isArray(
    quoteData.chat_history,
  )
    ? quoteData.chat_history
    : [];

  // The model's context is what WE stored, never the browser's copy.
  const history = storedChatHistoryForAgent(existingHistory);

  // Rate limit — count today's customer-side messages (UTC day).
  const startOfDayMs = (() => {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
  })();
  const todayCustomerCount = existingHistory.filter((e) => {
    if (e.role !== "customer") return false;
    const t = Date.parse(e.timestamp);
    return !Number.isNaN(t) && t >= startOfDayMs;
  }).length;
  if (todayCustomerCount >= MAX_MESSAGES_PER_DAY) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: `Too many messages today. The chat will reopen tomorrow — or you can email ${quote.business_email ?? "the tradie"} directly.`,
      },
      { status: 429 },
    );
  }

  // Run the agent. Failure here degrades to a polite fallback so the
  // customer never sees a raw 500 inside the chat sheet.
  const now = new Date().toISOString();
  let agentResult;
  try {
    agentResult = await runCustomerChat({
      quote,
      tradieBusinessName: quote.business_name,
      customerMessage: message,
      history,
    });
  } catch (e) {
    captureError(e, { route: "quote/chat" });
    console.error("customer-chat agent failed", e);
    // Persist the customer's message anyway so the tradie can see
    // the question even if the AI couldn't answer it.
    // Atomic append of just the customer's message via RPC — no
    // read-modify-write of the whole quote_data, so a concurrent chat or
    // tradie edit can't clobber it (lost-update fix).
    await admin.rpc("append_quote_chat_messages", {
      p_quote_id: quote.id,
      p_messages: [
        { role: "customer", content: message, timestamp: now },
      ] as unknown,
    } as never);
    return NextResponse.json({
      ok: true,
      reply:
        "Thanks for the message — I'm having trouble answering right now. The tradie will see your question and follow up directly.",
      noteToTradie: null,
    });
  }

  // Guideline 1.2 "filter" control, outbound: screen the MODEL's reply
  // before it is shown to the customer or persisted. A jailbroken /
  // prompt-injected reply gets replaced with a safe fallback; the raw
  // flagged text is never stored or displayed.
  const outboundVerdict = await moderateChatText(agentResult.reply, "outbound");
  const safeReply = outboundVerdict.allowed
    ? agentResult.reply
    : "I can't help with that here — the tradie will follow up with you directly about this quote.";
  if (!outboundVerdict.allowed) {
    captureError(
      new Error(`customer-chat outbound reply flagged: ${outboundVerdict.reason}`),
      { route: "quote/chat" },
    );
  }

  // Append the customer message + assistant reply (+ optional note)
  // and write back to quote_data. Single round-trip update.
  // Atomic append of the two new turns (customer + assistant) via RPC.
  // Only chat_history is touched, so concurrent chats / tradie edits to
  // quote_data no longer clobber each other (lost-update fix).
  const newMessages: ChatHistoryEntry[] = [
    { role: "customer", content: message, timestamp: now },
    {
      role: "assistant",
      content: safeReply,
      timestamp: new Date().toISOString(),
      intent: agentResult.intent,
      ...(agentResult.noteToTradie && outboundVerdict.allowed
        ? { note_to_tradie: agentResult.noteToTradie }
        : {}),
    },
  ];
  const { error: updateErr } = await admin.rpc("append_quote_chat_messages", {
    p_quote_id: quote.id,
    p_messages: newMessages as unknown,
  } as never);
  if (updateErr) {
    // Append failed but we still have a reply to give the customer.
    // Don't 500 — the conversation should continue.
    console.error("chat_history append failed", updateErr);
  }

  return NextResponse.json({
    ok: true,
    reply: safeReply,
    noteToTradie: outboundVerdict.allowed ? (agentResult.noteToTradie ?? null) : null,
    intent: agentResult.intent,
  });
}
