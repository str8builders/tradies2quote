import { isLocalTextAiProvider } from "@/lib/llm/local-chat";

export type QuoteTextProvider = "local" | "anthropic";

/**
 * Which text model answers quote generation.
 *  - TEXT_AI_PROVIDER=local → the OpenAI-compatible endpoint in LOCAL_LLM_*.
 *  - otherwise, ANTHROPIC_API_KEY present → hosted Claude (the original path).
 *  - neither → null; the route answers 503, never a crash.
 */
export function resolveQuoteTextProvider(
  env: Record<string, string | undefined> = process.env,
): QuoteTextProvider | null {
  if (isLocalTextAiProvider(env.TEXT_AI_PROVIDER)) return "local";
  if (env.ANTHROPIC_API_KEY?.trim()) return "anthropic";
  return null;
}
