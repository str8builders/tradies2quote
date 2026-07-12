import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const tour = readFileSync(
  join(root, "src/app/app/_components/OnboardingTour.tsx"),
  "utf8",
);
const dashboard = readFileSync(join(root, "src/app/app/page.tsx"), "utf8");
const calendar = readFileSync(
  join(root, "src/app/app/_components/ScheduleCalendar.tsx"),
  "utf8",
);
const quotes = readFileSync(
  join(root, "src/app/app/_components/QuotesListClient.tsx"),
  "utf8",
);
const mobileNav = readFileSync(
  join(root, "src/app/app/_components/MobileAppMenuClient.tsx"),
  "utf8",
);
const desktopNav = readFileSync(
  join(root, "src/app/app/_components/AppHeaderClient.tsx"),
  "utf8",
);

describe("first-run coachmark contract", () => {
  it("waits for the splash and streamed dashboard before starting", () => {
    expect(tour).toContain('skeleton: \'[data-testid="dashboard-skeleton"]\'');
    expect(tour).toContain("document.querySelector(TARGETS.splash)");
    expect(tour).toContain("document.querySelector(TARGETS.skeleton)");
    expect(tour).toContain("firstVisible(TARGETS.today)");
    expect(tour).toContain("waitForDashboard()");
  });

  it("keeps infrastructure failures retryable instead of consuming onboarding", () => {
    const abandonBody = tour.match(
      /const abandonTour = \(\) => \{([\s\S]*?)\n\s*\};/,
    )?.[1];
    const completeBody = tour.match(
      /const completeTour = \(\) => \{([\s\S]*?)\n\s*\};/,
    )?.[1];

    expect(abandonBody).toBeDefined();
    expect(abandonBody).not.toContain("markDone()");
    expect(completeBody).toContain("markDone()");
  });

  it("reveals collapsed planning targets and restores the user's prior state", () => {
    expect(dashboard).toContain('data-testid="dashboard-more-toggle"');
    expect(tour).toContain("current.open = true");
    expect(tour).toContain("current.open = dashboardMoreWasOpen");
  });

  it("locks highlighted controls, cleans up Driver, and renders Get started", () => {
    expect(tour).toContain("disableActiveInteraction: true");
    expect(tour).toContain("destroyDriverWithoutCompletion()");
    expect(tour).toContain('showButtons: ["previous", "next", "close"]');
    expect(tour).toContain('doneBtnText: "Get started"');
  });

  it("keeps every required selector attached to a real app control", () => {
    const dashboardSurface = `${dashboard}\n${calendar}\n${quotes}`;
    for (const testId of [
      "dashboard-new-quote",
      "dashboard-today",
      "dashboard-more",
      "dashboard-more-toggle",
      "dashboard-stage-tiles",
      "dashboard-pipeline-empty",
      "dashboard-calendar",
      "quotes-list-client",
      "dashboard-empty",
    ]) {
      expect(dashboardSurface).toContain(`data-testid="${testId}"`);
    }

    expect(mobileNav).toContain('data-testid="app-bottom-nav"');
    expect(mobileNav).toContain('testId: "materials"');
    expect(desktopNav).toContain('data-testid="app-header-tabs"');
    expect(desktopNav).toContain('data-tour="account-menu"');
    expect(mobileNav).toContain('data-tour="account-menu"');
  });
});
