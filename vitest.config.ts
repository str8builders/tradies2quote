import { configDefaults, defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Vitest runs in Node; the Next.js client-only `server-only` guard would
    // throw outside a build. Stub it for tests so server-side libs can be
    // unit-tested directly.
    // Order matters — Vite matches aliases in declaration order and the
    // first hit wins, so the specific logger entry MUST come before the
    // catch-all "@" prefix.
    alias: {
      "server-only": resolve(__dirname, "src/test/server-only-stub.ts"),
      // The agent-monitor logger writes to the PRODUCTION Supabase tables
      // through the service-role client whenever SUPABASE_SERVICE_ROLE_KEY
      // is in the environment. Every agent call logs run.start/run.finish,
      // so unit tests were creating real `agent_runs` rows. Stub it for the
      // whole suite; see src/test/agent-monitor-logger-stub.ts.
      "@/lib/agent-monitor/logger": resolve(
        __dirname,
        "src/test/agent-monitor-logger-stub.ts",
      ),
      "@": resolve(__dirname, "src"),
    },
    // `.claude/worktrees/` holds full git-worktree copies of the repo.
    // Without this exclude, vitest globs their test files too and runs
    // the whole suite once per worktree — several times slower, and any
    // failure shows up duplicated per copy. Spread the vitest defaults
    // so node_modules / dist / config-file exclusions aren't dropped.
    exclude: [...configDefaults.exclude, "**/.claude/**"],
  },
});
