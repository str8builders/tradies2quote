/**
 * Opt-in eval helpers — environment only, never prints a value.
 *
 * The AI evals read their key from the shell environment, falling back to
 * `.env.local` in the repo root (same rule as the older eval files). A key
 * found in `.env.local` is copied into `process.env` so the production agent
 * code under test (which reads `process.env.ANTHROPIC_API_KEY`) sees it.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export function loadEnvKey(name: string): string | null {
  const existing = process.env[name];
  if (existing && existing.trim()) return existing;
  try {
    const envFile = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of envFile.split(/\r?\n/)) {
      const m = line.match(new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`));
      if (m) {
        const value = m[1].replace(/^["']|["']$/g, "");
        process.env[name] = value;
        return value;
      }
    }
  } catch {
    // no .env.local — the caller skips.
  }
  return null;
}

/** True when the agents can reach a model: an Anthropic key, or the local provider. */
export function haveModelAccess(): boolean {
  if (process.env.TEXT_AI_PROVIDER?.trim().toLowerCase() === "local") return true;
  return loadEnvKey("ANTHROPIC_API_KEY") !== null;
}
