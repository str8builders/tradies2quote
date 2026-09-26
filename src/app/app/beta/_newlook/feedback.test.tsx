// Send feedback (/app/beta): the new-look switch, the new body rendered to
// static HTML in node (the top bar and the page now agree: it's the feedback
// page, with the pre-send checklist as a section), and the old page as before.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const env = vi.hoisted(() => ({ on: false, user: { id: "user-1" } as { id: string } | null }));

vi.mock("@/lib/ui/newLook", () => ({ isNewLookOn: async () => env.on }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: env.user } }) } }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
}));
vi.mock("@/app/app/_components/AppHeader", () => ({ AppHeader: () => null }));
vi.mock("../actions", () => ({ submitBetaFeedback: vi.fn() }));

import BetaHelpPage from "../page";
import { AppHeader } from "@/app/app/_components/AppHeader";
import { Screen } from "@/components/ui/screen";
import { legacyTopBar } from "@/app/app/_v2/lib/app-nav";
import { BetaFeedbackForm, FIELDS, type BetaFeedbackState } from "../_components/BetaFeedbackForm";
import { PRE_SEND_CHECKS } from "../_lib/checks";
import { FeedbackBody } from "./FeedbackBody";
import { FeedbackFormView } from "./FeedbackForm";

function findAll(node: unknown, type: unknown): ReactElement<Record<string, unknown>>[] {
  const found: ReactElement<Record<string, unknown>>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(visit);
    if (!value || typeof value !== "object" || !("props" in value)) return;
    const element = value as ReactElement<Record<string, unknown>>;
    if (element.type === type) found.push(element);
    for (const prop of Object.values(element.props ?? {})) visit(prop);
  };
  visit(node);
  return found;
}

/** Text as React writes it into HTML. */
const esc = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

const noop = () => {};
function feedback(over: Partial<BetaFeedbackState> = {}): BetaFeedbackState {
  return {
    values: { whatWorked: "", whatConfusing: "", wrongNumber: "", wouldPay: "" },
    status: "idle",
    error: null,
    submit: async () => {},
    setField: noop,
    reset: noop,
    ...over,
  };
}

beforeEach(() => {
  env.on = false;
  env.user = { id: "user-1" };
});

describe("/app/beta switch", () => {
  it("off: the old pre-send page, unchanged", async () => {
    const tree = (await BetaHelpPage()) as ReactElement<{ className: string }>;
    expect(tree.props.className).toBe("min-h-screen text-white");
    expect(findAll(tree, BetaFeedbackForm)).toHaveLength(1);
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Before you send.");
    for (const check of PRE_SEND_CHECKS) expect(html).toContain(esc(check));
  });

  it("on: the feedback page under the shared top bar", async () => {
    env.on = true;
    const tree = (await BetaHelpPage()) as ReactElement;
    expect(tree.type).toBe(Screen);
    expect(findAll(tree, AppHeader).map((el) => el.props.context)).toEqual(["Guide"]);
    expect(findAll(tree, FeedbackBody)).toHaveLength(1);
    expect(findAll(tree, BetaFeedbackForm)).toHaveLength(0);
  });

  it("signed out goes to the login page either way", async () => {
    env.user = null;
    await expect(BetaHelpPage()).rejects.toThrow("NEXT_REDIRECT /login");
    env.on = true;
    await expect(BetaHelpPage()).rejects.toThrow("NEXT_REDIRECT /login");
  });
});

describe("FeedbackBody (new look)", () => {
  const html = renderToStaticMarkup(<FeedbackBody />);

  it("agrees with its top bar: a feedback page, no second page title", () => {
    expect(legacyTopBar("/app/beta", "Guide").title).toBe("Send feedback");
    expect(html).not.toContain("<h1");
    expect(html).not.toContain("Before you send.");
    expect(html.indexOf('data-testid="beta-feedback-form"')).toBeLessThan(html.indexOf('data-testid="pre-send-checklist"'));
  });

  it("the four feedback boxes and one Send button", () => {
    for (const field of FIELDS) {
      expect(html).toMatch(new RegExp(`<textarea[^>]*name="${field.key}"`));
      expect(html).toContain(field.label);
    }
    expect(html).toMatch(/<button type="submit"[^>]*>[\s\S]*Send feedback/);
  });

  it("keeps the pre-send checklist as a section", () => {
    expect(html).toMatch(/<h2[^>]*>Before you send a quote<\/h2>/);
    for (const check of PRE_SEND_CHECKS) expect(html).toContain(esc(check));
  });

  it("uses the new look only", () => {
    expect(html).not.toMatch(/t2q-|font-mono|uppercase|bg-ink-|text-white|\/\/ /);
  });
});

describe("FeedbackFormView states", () => {
  it("sending, and a failed send", () => {
    const sending = renderToStaticMarkup(<FeedbackFormView feedback={feedback({ status: "sending" })} />);
    expect(sending).toContain('aria-busy="true"');
    expect(sending).toContain("Sending…");
    const failed = renderToStaticMarkup(
      <FeedbackFormView feedback={feedback({ status: "error", error: "Add a note in at least one box before sending." })} />,
    );
    expect(failed).toMatch(/role="alert"[\s\S]*Add a note in at least one box before sending\./);
  });

  it("sent: thanks, and a way to send another", () => {
    const html = renderToStaticMarkup(<FeedbackFormView feedback={feedback({ status: "sent" })} />);
    expect(html).toContain('data-testid="beta-feedback-sent"');
    expect(html).toContain("Every note goes straight to Challis.");
    expect(html).toContain(">Send another<");
  });
});
