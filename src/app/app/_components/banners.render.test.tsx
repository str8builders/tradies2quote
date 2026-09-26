// The two banners every /app screen can show (TrialBanner, BetaNoticeBanner),
// rendered to static HTML in node. The old look is pinned by file snapshots
// taken before the new-look variant existed, so look="old" (the default)
// provably renders exactly as before; look="new" (the new-look shell) draws
// the same banners, to the same people, as ui-token strips.

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SubscriptionStatus } from "@/lib/subscription";

const state = vi.hoisted(() => ({
  user: { id: "u-1", email: "tradie@example.test", created_at: "2026-09-01T00:00:00Z" } as {
    id: string;
    email: string;
    created_at: string;
  } | null,
  sub: {} as Partial<SubscriptionStatus>,
  nativeShell: false,
}));

vi.mock("@/lib/supabase/auth", () => ({ getCachedAuthUser: async () => ({ user: state.user, error: null }) }));
vi.mock("@/lib/native-shell", () => ({ isNativeShellRequest: async () => state.nativeShell }));
vi.mock("@/lib/subscription", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/subscription")>();
  return { ...actual, getCachedSubscriptionStatus: async () => state.sub as SubscriptionStatus };
});

import { markupRuleBreaks } from "@/test/design-rules";
import { BetaNoticeBanner, BetaNoticeStrip } from "./BetaNoticeBanner";
import { TrialBanner } from "./TrialBanner";

const FREE_UNTIL = new Date("2026-10-12T12:00:00Z");
/** The date as the banner prints it here (the label depends on the machine's time zone). */
const FREE_UNTIL_LABEL = FREE_UNTIL.toLocaleDateString("en-NZ", { day: "numeric", month: "short" });

const SUBS = {
  beta: { state: "trialing", trialDaysLeft: null, betaFreeUntil: FREE_UNTIL },
  expired: { state: "expired", trialDaysLeft: 0, betaFreeUntil: null },
  warning: { state: "trialing", trialDaysLeft: 2, betaFreeUntil: null },
  tomorrow: { state: "trialing", trialDaysLeft: 1, betaFreeUntil: null },
  lastDay: { state: "trialing", trialDaysLeft: 0, betaFreeUntil: null },
  midTrial: { state: "trialing", trialDaysLeft: 5, betaFreeUntil: null },
  paid: { state: "paid", trialDaysLeft: null, betaFreeUntil: null },
} satisfies Record<string, Partial<SubscriptionStatus>>;

async function trial(sub: Partial<SubscriptionStatus>, props: Parameters<typeof TrialBanner>[0] = {}) {
  state.sub = sub;
  const element = (await TrialBanner(props)) as ReactElement | null;
  return element ? renderToStaticMarkup(element).replaceAll(FREE_UNTIL_LABEL, "<DATE>") : "";
}
const trialNew = (sub: Partial<SubscriptionStatus>) => trial(sub, { look: "new" });

/** The opening tag of the element that holds a fragment. */
function tag(markup: string, fragment: string): string {
  const at = markup.indexOf(fragment);
  expect(at, fragment).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
}

beforeEach(() => {
  state.user = { id: "u-1", email: "tradie@example.test", created_at: "2026-09-01T00:00:00Z" };
  state.nativeShell = false;
});

describe("TrialBanner, old look (the default): exactly as before", () => {
  it.each(["beta", "expired", "warning"] as const)("%s", async (name) => {
    await expect(await trial(SUBS[name])).toMatchFileSnapshot(`./__snapshots__/TrialBanner.old.${name}.html`);
    expect(await trial(SUBS[name], { look: "old" })).toBe(await trial(SUBS[name]));
  });

  it("nothing for paid users, mid-trial users or when signed out", async () => {
    expect(await trial(SUBS.paid)).toBe("");
    expect(await trial(SUBS.midTrial)).toBe("");
    state.user = null;
    expect(await trial(SUBS.expired)).toBe("");
  });

  it("the iPhone app never receives the priced banners (3.1.3(f))", async () => {
    state.nativeShell = true;
    expect(await trial(SUBS.expired)).toBe("");
    expect(await trial(SUBS.warning)).toBe("");
  });
});

describe("TrialBanner, new look: the same banners as ui-token strips", () => {
  it("free access: an info strip to the pre-send checklist", async () => {
    const out = await trialNew(SUBS.beta);
    const link = tag(out, 'data-testid="beta-banner"');
    expect(link).toContain('href="/app/beta"');
    expect(link).toContain('data-tone="info"');
    expect(link).toContain("bg-ui-info-soft");
    expect(out).toContain("Free access until <DATE>.");
    expect(out).toContain("Pre-send checklist");
  });

  it("trial ended: a bad-tone strip to the upgrade page", async () => {
    const out = await trialNew(SUBS.expired);
    const link = tag(out, 'data-testid="trial-banner-expired"');
    expect(link).toContain('href="/app/upgrade"');
    expect(link).toContain('data-tone="bad"');
    expect(out).toContain("Your trial has ended, so new quotes are paused.");
    expect(out).toContain("Subscribe for $49 a month");
  });

  it("last days: a warn-tone strip, in plain words", async () => {
    const out = await trialNew(SUBS.warning);
    const link = tag(out, 'data-testid="trial-banner-warning"');
    expect(link).toContain('href="/app/upgrade"');
    expect(link).toContain('data-tone="warn"');
    expect(out).toContain("Your trial ends in 2 days.");
    expect(out).toContain("Subscribe for $49 a month");
    expect(await trialNew(SUBS.tomorrow)).toContain("Your trial ends tomorrow.");
    expect(await trialNew(SUBS.lastDay)).toContain("Your trial ends today.");
  });

  it("readable: 15 px words, the whole strip one 48 px tap target", async () => {
    for (const name of ["beta", "expired", "warning"] as const) {
      const out = await trialNew(SUBS[name]);
      expect(out, name).toContain("text-ui-sm");
      expect(out, name).toContain("min-h-12");
      expect(out.match(/<a /g), name).toHaveLength(1);
    }
  });

  it("follows the design rules (nothing from the old look)", async () => {
    for (const name of ["beta", "expired", "warning"] as const) {
      const out = await trialNew(SUBS[name]);
      expect(markupRuleBreaks(out), name).toEqual([]);
      expect(out, name).not.toContain("·");
    }
  });

  it("the same people see it: nothing for paid, mid-trial or signed-out users", async () => {
    expect(await trialNew(SUBS.paid)).toBe("");
    expect(await trialNew(SUBS.midTrial)).toBe("");
    state.user = null;
    expect(await trialNew(SUBS.expired)).toBe("");
  });

  it("the iPhone app gets no trial or billing banner at all, not even free access (3.1.3(f))", async () => {
    state.nativeShell = true;
    expect(await trialNew(SUBS.expired)).toBe("");
    expect(await trialNew(SUBS.warning)).toBe("");
    expect(await trialNew(SUBS.beta)).toBe("");
    expect(await trial(SUBS.beta)).toBe("");
  });
});

describe("BetaNoticeBanner", () => {
  it("renders nothing on the server in either look (it decides after mount, as before)", () => {
    expect(renderToStaticMarkup(<BetaNoticeBanner />)).toBe("");
    expect(renderToStaticMarkup(<BetaNoticeBanner look="new" />)).toBe("");
  });

  const strip = (leaving = false) => renderToStaticMarkup(<BetaNoticeStrip leaving={leaving} onDismiss={() => {}} />);

  it("new look: the reminder in 15 px words, with the same test ids", () => {
    const out = strip();
    expect(tag(out, 'data-testid="beta-review-notice"')).toContain('data-tone="info"');
    expect(out).toContain("Heads up:");
    expect(out).toContain("treat T2Q scopes, quantities and prices as drafts");
    expect(out).toContain("text-ui-sm");
    // Neutral words: "beta" labelling invites an App Review 2.1 rejection.
    expect(out.replace(/<[^>]*>/g, " ").toLowerCase()).not.toContain("beta");
  });

  it("new look: a 48 px dismiss button, and the guide link from sm up", () => {
    const out = strip();
    const dismiss = tag(out, 'data-testid="beta-review-dismiss"');
    expect(dismiss).toContain('aria-label="Dismiss reminder"');
    expect(dismiss).toContain('type="button"');
    expect(dismiss).toContain("h-12 w-12");
    expect(tag(out, 'data-testid="beta-review-link"')).toContain('href="/app/beta"');
    expect(out).toMatch(/<span class="hidden sm:inline-flex"><a [^>]*data-testid="beta-review-link"/);
  });

  it("new look: leaving fades it out, opacity only, and not at all for reduced motion", () => {
    const shown = tag(strip(), 'data-testid="beta-review-notice"');
    expect(shown).toContain("transition-opacity");
    expect(shown).toContain("motion-reduce:transition-none");
    expect(shown).not.toContain("opacity-0");
    expect(tag(strip(true), 'data-testid="beta-review-notice"')).toContain("opacity-0");
  });

  it("new look follows the design rules", () => {
    expect(markupRuleBreaks(strip())).toEqual([]);
    expect(markupRuleBreaks(strip(true))).toEqual([]);
  });
});
