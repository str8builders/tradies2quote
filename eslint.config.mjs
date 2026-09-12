import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Honour the standard underscore-prefix convention for intentionally
  // unused variables — applies to function args, destructured params,
  // catch clauses, and rest siblings. Without this, deliberate "_arg"
  // names still trigger no-unused-vars warnings.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Don't lint sibling worktree checkouts or Vercel CLI artifacts —
    // they contain duplicate copies of the codebase and bundled output.
    ".claude/**",
    ".vercel/**",
    // Plain CommonJS maintenance scripts legitimately use require().
    "scripts/**/*.cjs",
    "**/.next/**",
  ]),
]);

export default eslintConfig;
