import "server-only";
import { runStructuredAgent, type ParseResult } from "@/lib/agents/runtime";
import { isLocalTextAiProvider } from "@/lib/llm/local-chat";

/**
 * Content moderation for the public customer chat (Guideline 1.2).
 *
 * Two layers, both server-side in /api/quote/[token]/chat:
 *   1. `matchesBlocklist` — a small, high-precision local screen that costs
 *      nothing and always runs (even when the classifier is down). It only
 *      matches clearly objectionable content, never trade talk.
 *   2. An LLM classifier on the `fast` tier (the runtime's cheap model) that
 *      judges borderline input AND the assistant's own reply before it is
 *      shown or persisted.
 *
 * Failure posture: the classifier FAILS OPEN (a moderation outage must not
 * take down a legitimate customer conversation — the blocklist still ran,
 * the agent has its own strict system prompt, and the surface is already
 * rate-limited to 10 messages/day/token). A blocklist hit always blocks.
 */

export type ModerationVerdict = {
  allowed: boolean;
  /** Why it was blocked — "blocklist" | classifier category. */
  reason?: string;
};

// High-precision patterns for unambiguous objectionable content. Kept
// deliberately narrow: false positives on a builder's chat ("demolish the
// wall", "kill the power") would break the product, so anything ambiguous is
// left to the classifier.
const BLOCKLIST: ReadonlyArray<RegExp> = [
  /\bkill\s+(?:your|ur)\s*self\b/i,
  /\bkys\b/i,
  /\bi(?:'|’)?ll\s+(?:kill|hurt|stab|shoot)\s+you\b/i,
  /\bn[i1]gg(?:er|a)s?\b/i,
  /\bfagg?ots?\b/i,
  /\bc[o0]{2}ns?\b\s+(?:are|is)\b/i,
  /\bchild\s*(?:porn|sexual|abuse\s+material)\b/i,
  /\bcsam\b/i,
  /\brape\s+(?:you|her|him|them)\b/i,
];

/** Pure, fast local screen. Exported for unit tests. */
export function matchesBlocklist(text: string): boolean {
  return BLOCKLIST.some((re) => re.test(text));
}

const MODERATION_TOOL = {
  name: "emit_moderation_verdict",
  description:
    "Classify whether the text is objectionable for a business quote chat.",
  schema: {
    type: "object",
    required: ["flagged"],
    properties: {
      flagged: {
        type: "boolean",
        description: "true ONLY for clearly objectionable content.",
      },
      category: {
        type: "string",
        description:
          "When flagged: hate | harassment | sexual | violence | self-harm | illegal.",
      },
    },
  },
};

const MODERATION_SYSTEM = `You are a content-safety classifier for a chat between a tradesperson's customer and an AI assistant about a building/trade quote.

Flag a message ONLY if it clearly contains: hate speech or slurs; sexual content; credible threats or glorification of violence against people; encouragement of self-harm; harassment or bullying of a person; or solicitation of clearly illegal activity.

Do NOT flag: normal trade language ("demolish the wall", "kill the power to the switchboard", "rip out the bathroom"), pricing complaints, frustration or mild profanity ("this quote is bloody expensive"), negotiation, or off-topic small talk. When in doubt, do not flag.

Respond only by calling emit_moderation_verdict.`;

function parseVerdict(input: unknown): ParseResult<{ flagged: boolean; category?: string }> {
  const parsed = (input ?? {}) as { flagged?: unknown; category?: unknown };
  return {
    ok: true,
    value: {
      flagged: parsed.flagged === true,
      category:
        typeof parsed.category === "string" ? parsed.category : undefined,
    },
  };
}

/**
 * Moderate one chat text (a customer message or the assistant's reply).
 * Never throws. `direction` only labels the monitor entry.
 */
export async function moderateChatText(
  text: string,
  direction: "inbound" | "outbound",
): Promise<ModerationVerdict> {
  if (matchesBlocklist(text)) {
    return { allowed: false, reason: "blocklist" };
  }
  // The deployed Qwen model is uncensored and CPU-only. Asking it to moderate
  // would add two long, serial calls to every public chat turn without a
  // trustworthy safety benefit. Keep the high-precision blocklist and the
  // route's strict rate limit; a future external classifier can use the path
  // below when the text provider is not local.
  if (isLocalTextAiProvider()) {
    return { allowed: true, reason: "local_blocklist_only" };
  }
  try {
    const result = await runStructuredAgent<{ flagged: boolean; category?: string }>({
      agentName: `Chat Moderation (${direction})`,
      system: MODERATION_SYSTEM,
      user: `TEXT TO CLASSIFY:\n${text.slice(0, 2000)}`,
      tool: MODERATION_TOOL,
      parse: parseVerdict,
      tier: "fast",
      maxTokens: 120,
    });
    if (result.value.flagged) {
      return { allowed: false, reason: result.value.category ?? "flagged" };
    }
    return { allowed: true };
  } catch {
    // Fail open — see module docblock for why.
    return { allowed: true, reason: "classifier_unavailable" };
  }
}

/**
 * Sanitise free text destined for a NATIVE PUSH NOTIFICATION (e.g. the
 * customer-typed name on the accept form). Strips control characters and
 * newlines, collapses whitespace, and caps length so an anonymous visitor
 * can't inject multi-line / oversized content into an OS-level banner on
 * the tradie's phone.
 */
export function sanitizeForPush(text: string | null | undefined, maxLen = 60): string {
  const cleaned = (text ?? "")
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen - 1)}…` : cleaned;
}
