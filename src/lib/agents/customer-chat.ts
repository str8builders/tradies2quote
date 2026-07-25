/**
 * Customer Chat Agent — Wave 36.
 *
 * Powers the "Quote That Sells Itself" chat bubble that lives at the
 * bottom of every public quote view (/quote/[token]). The customer
 * (the tradie's client, who has NO account on T2Q) can ask questions
 * about the quote they've just received and get instant answers from
 * an AI that knows:
 *
 *   - The exact line items, quantities, unit prices, totals
 *   - The terms, the deposit policy, the validity window
 *   - The tradie's business name (and where to address messages)
 *   - The job summary + scope
 *
 * The agent never agrees to a price drop. It never auto-modifies the
 * quote. If the customer asks for something that requires the
 * tradie's input (cheaper alternative, scope change, scheduling),
 * the agent returns a `noteToTradie` field — the API route persists
 * it as a quote_event so the tradie sees the question + the suggested
 * response in their app the next time they open the quote.
 *
 * Server-only. Needs ANTHROPIC_API_KEY at runtime.
 */
import "server-only";
import type { PublicQuotePayload } from "@/lib/quote-types";
import { runStructuredAgent, type ParseResult } from "./runtime";

export const CHAT_INTENTS = [
  "explain_line_item",
  "explain_terms",
  "wants_cheaper_alternative",
  "asks_about_timing",
  "asks_about_warranty_or_consent",
  "wants_scope_change",
  "ready_to_accept",
  "small_talk_or_thanks",
  "general_question",
] as const;
export type ChatIntent = (typeof CHAT_INTENTS)[number];

/** One message in the running chat history. */
export interface ChatMessage {
  role: "customer" | "assistant";
  content: string;
}

export interface CustomerChatInput {
  /** Public-quote shape — the same payload the customer's quote page reads. */
  quote: PublicQuotePayload;
  /** Tradie's business name — used so the agent can write "Challis will…". */
  tradieBusinessName: string | null;
  /** The new message the customer just sent. */
  customerMessage: string;
  /** Up to ~20 prior turns of the conversation, oldest first. */
  history: ChatMessage[];
}

export interface CustomerChatResult {
  intent: ChatIntent;
  /** The visible reply the chat UI renders. NZ English, plain. */
  reply: string;
  /**
   * Optional note for the TRADIE. If present, the API route logs it
   * as a quote_event of type='chat-note' and shows it in the tradie's
   * preview-page LifecycleCard. Use this when the customer is asking
   * for something the tradie has to action (price change, scope
   * change, scheduling decision).
   */
  noteToTradie?: string;
  /** Model self-rated confidence (0–1). Cosmetic; never blocks the reply. */
  confidence: number;
}

const MAX_TOKENS = 800;

const SYSTEM_PROMPT = `You are a polite, helpful chat assistant embedded inside a quote PDF a NZ tradie has just sent to a customer. You are working FOR the tradie — you represent them, not the customer.

The customer is reading the quote and chatting with you. They may ask about line items, terms, timing, alternatives, or just confirm they want to accept.

Your boundaries — these are firm:
- NEVER agree to a price reduction or discount on behalf of the tradie. If the customer pushes for a cheaper price, explain how the price was built (materials + labour + markup + GST) and offer to flag a scope-change question to the tradie via a "noteToTradie". Never invent a lower number.
- NEVER quote a new price for changed scope. Tell the customer the tradie will confirm a revised price, and capture the requested change in "noteToTradie".
- NEVER agree to a start date or timeline. Tell the customer the tradie will confirm dates after acceptance.
- NEVER claim consent IS required — only that it MAY be required for certain work types. Defer to council.
- NEVER invent line items, prices, or warranty terms that aren't in the quote.
- NEVER share customer details across quotes. You only see this one quote.

How to behave:
- Use the customer's own words. NZ English. Short sentences. No corporate language.
- Refer to the tradie by their business name when relevant (e.g. "the team at Bayside Builders"). NEVER invent a first name for the tradie — you don't know who they are; use the business name only.
- Be specific. Cite the actual quote when you can — line names, line totals, subtotal, total. Numbers come from the quote payload, not your imagination.
- For "wants_cheaper_alternative" intents, you may SUGGEST common NZ-trade substitutions verbally (e.g. "GIB Standard 13mm instead of Aqualine"), but make it clear the tradie has to confirm the price impact. Set a noteToTradie summarising the request.
- For "ready_to_accept" intents, tell the customer to use the green Accept Quote button further up the page. Never claim to have accepted on their behalf.
- For "small_talk_or_thanks", reply briefly and warmly. No noteToTradie needed.
- If the customer goes off-topic (asking about other tradies, your AI nature, anything not quote-related), redirect politely.

Return your answer by calling the emit_chat_reply tool:
- "reply" is the visible message to the customer, max 4 short sentences
- "noteToTradie" is null when no action needed from the tradie, otherwise a 1-2 sentence summary of what the customer is asking for
- "confidence" is 0..1
Do not reply with prose — only the tool call.`;

const CHAT_TOOL = {
  name: "emit_chat_reply",
  description: "Return the customer chat reply, intent, and optional tradie note.",
  schema: {
    type: "object",
    required: ["intent", "reply", "confidence"],
    properties: {
      intent: { type: "string", enum: [...CHAT_INTENTS] },
      reply: { type: "string", description: "Visible reply, max 4 short sentences." },
      noteToTradie: {
        type: ["string", "null"],
        description: "1-2 sentence note when the tradie must action something, else null.",
      },
      confidence: { type: "number" },
    },
  },
};

/** Validate + normalise the model's emit_chat_reply tool input. Pure. */
export function parseCustomerChat(
  input: unknown,
): ParseResult<CustomerChatResult> {
  const parsed = (input ?? {}) as {
    intent?: unknown;
    reply?: unknown;
    noteToTradie?: unknown;
    confidence?: unknown;
  };
  const intent: ChatIntent = isChatIntent(parsed.intent)
    ? parsed.intent
    : "general_question";
  const reply =
    typeof parsed.reply === "string" && parsed.reply.trim().length > 0
      ? parsed.reply.trim()
      : "Thanks for the message — let me get back to you on that.";
  const noteToTradie =
    typeof parsed.noteToTradie === "string" && parsed.noteToTradie.trim().length > 0
      ? parsed.noteToTradie.trim()
      : undefined;
  const rawConfidence =
    typeof parsed.confidence === "number" ? parsed.confidence : 0.6;
  const confidence = Math.max(0, Math.min(1, rawConfidence));
  return { ok: true, value: { intent, reply, noteToTradie, confidence } };
}

/** Format the quote payload + history into the user-turn prompt. */
function buildUserTurn(input: CustomerChatInput): string {
  const q = input.quote;
  const tradieName = input.tradieBusinessName ?? "the tradie";

  const lines = [
    "QUOTE CONTEXT (the customer is looking at this quote right now):",
    `Tradie: ${tradieName}`,
    `Issued: ${q.created_at}`,
    `Valid until: ${q.expires_at ?? "30 days from issue"}`,
    `Job summary: ${q.job_summary ?? "(no summary)"}`,
    "",
    "Line items:",
    ...q.line_items.map(
      (li, i) =>
        `  ${i + 1}. ${li.description} — ${li.quantity} ${li.unit} @ ${q.currency} ${li.unit_price} = ${q.currency} ${li.line_total} (${li.type})`,
    ),
    "",
    `Materials subtotal: ${q.currency} ${q.materials_subtotal}`,
    `Labour subtotal: ${q.currency} ${q.labour_subtotal}`,
    `Markup amount: ${q.currency} ${q.markup_amount}`,
    `${q.tax_label} ${q.tax_rate}%: ${q.currency} ${q.tax_amount}`,
    `Subtotal before tax: ${q.currency} ${q.subtotal_before_tax}`,
    `Total (inc. tax): ${q.currency} ${q.total}`,
    "",
    `Terms: ${q.terms ?? "(standard NZ terms)"}`,
    "",
  ];

  if (input.history.length > 0) {
    lines.push("CONVERSATION SO FAR (oldest first):");
    for (const m of input.history.slice(-20)) {
      lines.push(`${m.role === "customer" ? "Customer" : "You"}: ${m.content}`);
    }
    lines.push("");
  }

  lines.push("NEW CUSTOMER MESSAGE:");
  lines.push(input.customerMessage);
  lines.push("");
  lines.push("Answer by calling the emit_chat_reply tool. Do not add any other text.");

  return lines.join("\n");
}

function isChatIntent(value: unknown): value is ChatIntent {
  return (
    typeof value === "string" &&
    (CHAT_INTENTS as readonly string[]).includes(value)
  );
}

/**
 * Run one round of the customer chat agent. The route handler is
 * responsible for persisting messages + noteToTradie events; this
 * function is pure compute (one LLM call, no I/O beyond it).
 */
export async function runCustomerChat(
  input: CustomerChatInput,
): Promise<CustomerChatResult> {
  const result = await runStructuredAgent<CustomerChatResult>({
    agentName: "Customer Chat",
    system: SYSTEM_PROMPT,
    user: buildUserTurn(input),
    tool: CHAT_TOOL,
    parse: parseCustomerChat,
    maxTokens: MAX_TOKENS,
  });
  return result.value;
}
