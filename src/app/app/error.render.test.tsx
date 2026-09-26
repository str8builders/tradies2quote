// The /app error screen. An error boundary can't ask which look is on, so one
// markup has to read right in both shells: kit parts and ui- tokens only, on
// its own ui background (the settings LoadFailed pattern).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Reporting runs in an effect (never during a static render); stubbed so the
// test never touches the network or Sentry.
vi.mock("@/lib/observability/sentryBrowser", () => ({ captureToSentry: vi.fn() }));
vi.mock("@/lib/observability/clientReport", () => ({ reportClientError: vi.fn() }));
vi.mock("@/lib/staleDeploy", () => ({ maybeRecoverFromStaleDeploy: vi.fn() }));

import { markupRuleBreaks, sourceRuleBreaks } from "@/test/design-rules";
import AppError from "./error";

const render = (digest?: string) => {
  const error = Object.assign(new Error("secret stack detail"), digest ? { digest } : {});
  return renderToStaticMarkup(<AppError error={error} reset={() => {}} />);
};
// Rendered once up front (the first render pays for warming React up).
const plain = render();
const withCode = render("abc123");

/** The opening tag of the element that holds a fragment. */
function tag(markup: string, fragment: string): string {
  const at = markup.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
}

describe("/app error screen", () => {
  it("says what happened in plain words, as the page's heading", () => {
    const out = plain;
    expect(out).toMatch(/<h1 class="ui-heading[^"]*">Something went wrong<\/h1>/);
    expect(out).toContain('data-tone="bad"');
    expect(out).toContain("This page hit an unexpected error");
    expect(out).toContain("Your work isn&#x27;t lost");
  });

  it("two calm ways out: Try again (a button) and Home", () => {
    const out = plain;
    const retry = tag(out, 'data-testid="app-error-retry"');
    expect(retry).toContain('type="button"');
    expect(retry).toContain("min-h-12");
    const home = tag(out, 'data-testid="app-error-dashboard"');
    expect(home).toContain('href="/app"');
    expect(home).toContain("min-h-12");
    expect(out).toContain("Back to Home");
  });

  it("shows only the error code, never the message or stack", () => {
    expect(withCode).toContain('Error code: <span class="tabular-nums">abc123</span>');
    expect(plain).not.toContain("Error code");
    expect(withCode).not.toContain("secret stack detail");
  });

  it("paints its own ui background, so it reads right in either shell, dark or outdoor", () => {
    const screen = tag(plain, 'data-testid="app-error"');
    expect(screen).toContain("bg-ui-bg");
    expect(screen).toContain("text-ui-text");
  });

  it("nothing from the old look", () => {
    const out = withCode;
    for (const old of ["t2q-", "font-mono", "uppercase", "text-white", "text-ink", "red-", "tripped a circuit", "// "]) {
      expect(out).not.toContain(old);
    }
  });

  it("follows the design rules, in what it renders and in its source", () => {
    expect(markupRuleBreaks(withCode)).toEqual([]);
    const source = readFileSync(join(process.cwd(), "src/app/app/error.tsx"), "utf8");
    expect(sourceRuleBreaks(source)).toEqual([]);
  });
});
