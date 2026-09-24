import type { ChatMessage } from "./customer-chat";

/** Most recent stored turns given to the model (the prompt keeps 20 too). */
export const MAX_CHAT_HISTORY_ENTRIES = 20;
/** Per-turn cap. Customer turns are already limited to 1000 on the way in. */
export const MAX_CHAT_HISTORY_ENTRY_CHARS = 1000;

/**
 * Conversation context for the public quote chat, built ONLY from the
 * `quote_data.chat_history` the server itself stored. The browser's copy of
 * the conversation is never trusted: an anonymous token holder could forge
 * "assistant" turns (say, a discount the tradie never offered) and steer the
 * model with them, or post unbounded history. Stored entries are narrowed to
 * role + content (internal notes to the tradie stay out of the prompt),
 * limited to the most recent turns and capped in length.
 */
export function storedChatHistoryForAgent(stored: unknown): ChatMessage[] {
  if (!Array.isArray(stored)) return [];
  const turns = stored.flatMap((entry): ChatMessage[] => {
    if (!entry || typeof entry !== "object") return [];
    const { role, content } = entry as { role?: unknown; content?: unknown };
    if (role !== "customer" && role !== "assistant") return [];
    if (typeof content !== "string" || content.trim() === "") return [];
    return [{ role, content: content.slice(0, MAX_CHAT_HISTORY_ENTRY_CHARS) }];
  });
  return turns.slice(-MAX_CHAT_HISTORY_ENTRIES);
}
