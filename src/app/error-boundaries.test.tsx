// The three error boundaries (src/app/error.tsx, src/app/app/error.tsx,
// src/app/global-error.tsx), called as plain functions with useEffect run
// inline, since the suite has no DOM:
//   - server errors (with a digest) and stale deploys are not re-reported;
//     real client errors are;
//   - "Try again" calls retry() (fetch again), not reset() (re-render only);
//   - a stale deploy still reloads, and nothing clears the browser storage.

import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ report: vi.fn(), sentry: vi.fn(), recover: vi.fn() }));

vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: (effect: () => void) => effect(),
}));
vi.mock("@/lib/observability/clientReport", () => ({ reportClientError: h.report }));
vi.mock("@/lib/observability/sentryBrowser", () => ({ captureToSentry: h.sentry }));
vi.mock("@/lib/staleDeploy", async (original) => ({
  ...(await original<typeof import("@/lib/staleDeploy")>()),
  maybeRecoverFromStaleDeploy: h.recover,
}));

import RootError from "./error";
import AppError from "./app/error";
import GlobalError from "./global-error";

type Boundary = (props: { error: Error & { digest?: string }; retry: () => void }) => unknown;

const BOUNDARIES: Array<[string, Boundary, string]> = [
  ["root", RootError as Boundary, "root-error-retry"],
  ["app", AppError as Boundary, "app-error-retry"],
  ["global", GlobalError as Boundary, ""],
];

/** Depth-first search of a returned element tree (children and element props). */
function find(node: unknown, match: (element: ReactElement<Record<string, unknown>>) => boolean): ReactElement<Record<string, unknown>> | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, match);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== "object" || !("props" in node)) return null;
  const element = node as ReactElement<Record<string, unknown>>;
  if (match(element)) return element;
  for (const prop of Object.values(element.props ?? {})) {
    const found = find(prop, match);
    if (found) return found;
  }
  return null;
}

const tryAgain = (tree: unknown, testId: string) =>
  find(tree, (el) => (testId ? el.props["data-testid"] === testId : el.type === "button"));

let storage: { clear: ReturnType<typeof vi.fn>; removeItem: ReturnType<typeof vi.fn> };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  storage = { clear: vi.fn(), removeItem: vi.fn() };
  vi.stubGlobal("sessionStorage", storage);
  vi.stubGlobal("localStorage", storage);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe.each(BOUNDARIES)("%s error boundary", (_name, Boundary, testId) => {
  it("reports a real client-side error", () => {
    Boundary({ error: new TypeError("x is undefined"), retry: vi.fn() });
    expect(h.report).toHaveBeenCalledTimes(1);
    expect(h.sentry).toHaveBeenCalledTimes(1);
  });

  it("does not re-report a server error the server already logged", () => {
    Boundary({ error: Object.assign(new Error("An error occurred in the Server Components render."), { digest: "1234567" }), retry: vi.fn() });
    expect(h.report).not.toHaveBeenCalled();
    expect(h.sentry).not.toHaveBeenCalled();
  });

  it("does not report a stale deploy, and reloads for it", () => {
    const stale = Object.assign(new Error('Server Action "7f3a9c" was not found on the server.'), { name: "UnrecognizedActionError" });
    Boundary({ error: stale, retry: vi.fn() });
    expect(h.report).not.toHaveBeenCalled();
    expect(h.sentry).not.toHaveBeenCalled();
    expect(h.recover).toHaveBeenCalledWith(expect.stringContaining("was not found on the server"));
  });

  it("Try again fetches the page again (retry), and nothing clears saved work", () => {
    const retry = vi.fn();
    const tree = Boundary({ error: new Error("boom"), retry });
    const button = tryAgain(tree, testId);
    expect(button, "Try again button").not.toBeNull();
    (button!.props.onClick as () => void)();
    expect(retry).toHaveBeenCalledTimes(1);
    expect(storage.clear).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});
