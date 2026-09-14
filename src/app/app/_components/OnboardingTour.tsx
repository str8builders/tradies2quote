"use client";

import { useEffect } from "react";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";

/**
 * First-run onboarding tour — Driver.js rewrite.
 *
 * Replaces the previous slide-deck modal with a real coachmark tour
 * that highlights actual elements on the live app surface. The driver
 * overlay dims the page and spotlights one element at a time; the
 * popover carries the title + description + Next/Back/Skip buttons.
 *
 * Anchors map to data-testid attributes already in the app (see
 * src/app/app/page.tsx, AppHeaderClient, MobileAppMenuClient). For
 * features that live on other routes (Materials, account settings),
 * we anchor to the always-visible navigation controls — bottom nav
 * on phones, header tabs on desktop — so the tour can run from
 * any /app/* page even though it's intended to fire on the dashboard.
 *
 * Gating is unchanged: `OnboardingTourGate.tsx` reads
 * `localStorage["t2q-tour-done"]` and only dynamic-imports this chunk
 * for users who haven't completed the tour. After completion or skip
 * we write the same key so the tour never re-runs.
 */

const STORAGE_KEY = "t2q-tour-done";

/** Professional app-shell overrides for Driver.js's default popover.
 *  Scoped to `.t2q-tour` via popoverClass so it never leaks to any
 *  other Driver.js instance someone might add later. */
const POPOVER_CSS = `
.driver-popover.t2q-tour {
  background-color: #1A201E;
  color: #F4F5EF;
  border: 1px solid #ffffff20;
  border-radius: 18px;
  padding: 24px 24px 20px;
  max-width: 370px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
}
@media (max-width: 480px) {
  .driver-popover.t2q-tour {
    max-width: calc(100vw - 32px);
  }
}
.driver-popover.t2q-tour .driver-popover-title {
  font-family: var(--font-plus-jakarta), 'Inter', system-ui, sans-serif;
  font-size: 21px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #F4F5EF;
  margin-bottom: 8px;
}
.driver-popover.t2q-tour .driver-popover-description {
  font-size: 13.5px;
  line-height: 1.55;
  color: #B8C0B9;
}
.driver-popover.t2q-tour .driver-popover-progress-text {
  font-family: var(--font-plus-jakarta), 'Inter', system-ui, sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #FF5F15;
}
.driver-popover.t2q-tour .driver-popover-footer {
  margin-top: 16px;
}
.driver-popover.t2q-tour .driver-popover-footer button {
  font-family: var(--font-plus-jakarta), 'Inter', system-ui, sans-serif;
  font-size: 12px;
  font-weight: 700;
  padding: 12px 18px;
  min-height: 44px;
  border-radius: 8px;
  border: 1px solid #ffffff20;
  background: #242D28;
  color: #F4F5EF;
  text-shadow: none;
  transition: background-color 0.15s, color 0.15s, border-color 0.15s;
}
.driver-popover.t2q-tour .driver-popover-footer button:hover {
  background: #303A33;
  border-color: #FFB68A;
  color: #E04F0A;
}
.driver-popover.t2q-tour .driver-popover-next-btn {
  background: #FF5F15 !important;
  color: #FFFFFF !important;
  border-color: #FF5F15 !important;
}
.driver-popover.t2q-tour .driver-popover-next-btn:hover {
  background: #E04F0A !important;
  border-color: #E04F0A !important;
  color: #FFFFFF !important;
}
.driver-popover.t2q-tour .driver-popover-close-btn {
  color: #94A3B8;
  font-size: 22px;
  width: 44px;
  height: 44px;
}
.driver-popover.t2q-tour .driver-popover-close-btn:hover,
.driver-popover.t2q-tour .driver-popover-close-btn:focus {
  color: #FF5F15;
}
.driver-popover.t2q-tour .driver-popover-arrow {
  border-color: #1A201E;
}
.driver-popover.t2q-tour .driver-popover-arrow-side-top { border-bottom-color: transparent; border-left-color: transparent; border-right-color: transparent; }
.driver-popover.t2q-tour .driver-popover-arrow-side-bottom { border-top-color: transparent; border-left-color: transparent; border-right-color: transparent; }
.driver-popover.t2q-tour .driver-popover-arrow-side-left { border-right-color: transparent; border-top-color: transparent; border-bottom-color: transparent; }
.driver-popover.t2q-tour .driver-popover-arrow-side-right { border-left-color: transparent; border-top-color: transparent; border-bottom-color: transparent; }
.driver-overlay {
  background: rgba(15, 23, 42, 0.42) !important;
}
.driver-active-element {
  border-radius: 12px !important;
  box-shadow: 0 0 0 3px rgba(255, 95, 21, 0.28) !important;
}
`;

const STYLE_TAG_ID = "t2q-tour-overrides";

function ensureStyleTag() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_TAG_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_TAG_ID;
  style.textContent = POPOVER_CSS;
  document.head.appendChild(style);
}

const TARGETS = {
  splash:
    '[data-testid="loading-screen"], [data-testid="app-splash"]',
  skeleton: '[data-testid="dashboard-skeleton"]',
  businessName: '[data-testid="dashboard-business-name-banner"]',
  materialsQuickStart: '[data-testid="dashboard-quick-start-banner"]',
  newQuote: '[data-testid="dashboard-new-quote"]',
  today: '[data-testid="dashboard-today"]',
  dashboardMore: '[data-testid="dashboard-more"]',
  dashboardMoreToggle: '[data-testid="dashboard-more-toggle"]',
  pipeline:
    '[data-testid="dashboard-stage-tiles"], [data-testid="dashboard-pipeline-empty"]',
  calendar: '[data-testid="dashboard-calendar"]',
  recent: '[data-testid="dashboard-view-quotes"]',
  navigation:
    '[data-testid="app-header-tabs"], [data-testid="app-bottom-nav"]',
  materials:
    '[data-testid="app-header-tab-materials"], [data-testid="app-bottom-nav-materials"]',
  account: '[data-tour="account-menu"]',
} as const;

/** Desktop and mobile keep both navigation surfaces in the DOM. Resolve
 * the first rendered match rather than letting querySelector select a
 * hidden desktop node on a phone (or the hidden mobile node on desktop). */
function firstVisible(selector: string): HTMLElement | null {
  const nodes = Array.from(document.querySelectorAll<HTMLElement>(selector));
  for (const element of nodes) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (
      rect.width > 1 &&
      rect.height > 1 &&
      style.visibility !== "hidden" &&
      style.display !== "none" &&
      style.opacity !== "0"
    ) {
      return element;
    }
  }
  return null;
}

/** Keep the requested popover side when it fits, but point inward for
 * controls pinned close to a viewport edge (mobile bottom nav/avatar). */
function edgeAwareStep(
  element: HTMLElement,
  popover: NonNullable<DriveStep["popover"]>,
): DriveStep {
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || 0;
  const rect = element.getBoundingClientRect();
  let side = popover.side;
  if (viewportHeight > 0 && rect.top > viewportHeight * 0.6) side = "top";
  else if (viewportHeight > 0 && rect.bottom < viewportHeight * 0.25) {
    side = "bottom";
  }
  return { element, popover: { ...popover, side } };
}

function markDone() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // localStorage unavailable — re-showing the tour on next visit is
    // fine if storage fails.
  }
}

interface OnboardingTourProps {
  onFinished?: () => void;
}

export function OnboardingTour({ onFinished }: OnboardingTourProps) {
  useEffect(() => {
    ensureStyleTag();

    let cancelled = false;
    let finished = false;
    let tourStarted = false;
    let suppressDestroyCallback = false;
    let driverObj: ReturnType<typeof driver> | null = null;
    // The pipeline/calendar section is always open now, so there is no
    // collapsed state to reveal or restore.
    const restoreDashboardMore = () => {};

    /** User close, Escape, overlay-close, and Done are intentional exits. */
    const completeTour = () => {
      if (finished) return;
      finished = true;
      markDone();
      restoreDashboardMore();
      onFinished?.();
    };

    /** Startup/time-out/Driver failures must not consume first-run help. */
    const abandonTour = () => {
      if (finished) return;
      finished = true;
      restoreDashboardMore();
      onFinished?.();
    };

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const schedule = (fn: () => void, ms: number) => {
      const t = setTimeout(() => {
        timers.delete(t);
        if (!cancelled) fn();
      }, ms);
      timers.add(t);
    };

    const POLL_INTERVAL_MS = 200;
    const MAX_WAIT_MS = 15_000;
    const SETTLE_AFTER_READY_MS = 250;
    const MIN_COMPLETE_STEP_COUNT = 11;
    const startedAt = Date.now();

    const dashboardIsReady = () => {
      if (
        document.querySelector(TARGETS.splash) ||
        document.querySelector(TARGETS.skeleton)
      ) {
        return false;
      }

      return Boolean(
        firstVisible(TARGETS.newQuote) &&
          firstVisible(TARGETS.today) &&
          firstVisible(TARGETS.dashboardMoreToggle) &&
          document.querySelector(TARGETS.pipeline) &&
          document.querySelector(TARGETS.calendar) &&
          firstVisible(TARGETS.recent) &&
          firstVisible(TARGETS.navigation) &&
          firstVisible(TARGETS.materials) &&
          firstVisible(TARGETS.account),
      );
    };

    const buildSteps = (): DriveStep[] | null => {
      const newQuote = firstVisible(TARGETS.newQuote);
      const today = firstVisible(TARGETS.today);
      const more = document.querySelector<HTMLElement>(TARGETS.dashboardMore);
      const moreToggle = firstVisible(TARGETS.dashboardMoreToggle);
      const pipeline = document.querySelector<HTMLElement>(TARGETS.pipeline);
      const calendar = document.querySelector<HTMLElement>(TARGETS.calendar);
      const recent = firstVisible(TARGETS.recent);
      const navigation = firstVisible(TARGETS.navigation);
      const materials = firstVisible(TARGETS.materials);
      const account = firstVisible(TARGETS.account);

      if (
        !newQuote ||
        !today ||
        !more ||
        !moreToggle ||
        !pipeline ||
        !calendar ||
        !recent ||
        !navigation ||
        !materials ||
        !account
      ) {
        return null;
      }

      const revealMoreTarget = (
        selector: string,
        fallback: HTMLElement,
      ): (() => Element) => {
        return () =>
          firstVisible(selector) ??
          document.querySelector<HTMLElement>(selector) ??
          fallback;
      };

      const steps: DriveStep[] = [
        {
          popover: {
            title: "Welcome to Tradies2Quote",
            description:
              "A quick walk through your workspace: set up your business, capture a job, review the figures and send a professional quote.",
            showButtons: ["next", "close"],
            nextBtnText: "Start tour",
          },
        },
      ];

      const businessName = firstVisible(TARGETS.businessName);
      if (businessName) {
        steps.push(
          edgeAwareStep(businessName, {
            title: "Add your business name",
            description:
              "Set this first so your business name appears correctly on quote PDFs and customer emails.",
            side: "bottom",
            align: "center",
          }),
        );
      }

      const quickStart = firstVisible(TARGETS.materialsQuickStart);
      if (quickStart) {
        steps.push(
          edgeAwareStep(quickStart, {
            title: "Set up common materials",
            description:
              "Add your commonly used materials, then check each price against your own suppliers. Starter prices are a starting point, not live supplier prices.",
            side: "bottom",
            align: "center",
          }),
        );
      }

      steps.push(
        edgeAwareStep(newQuote, {
          title: "Create a quote",
          description:
            "Open New quote. Describe the scope, measurements, materials and labour. Type your notes, or use voice and drawing scan when available. You can edit the draft before sending.",
          side: "bottom",
          align: "center",
        }),
        edgeAwareStep(today, {
          title: "Your work today",
          description:
            "See upcoming work and items that need attention. Site conditions and readiness suggestions support your own checks before starting a job.",
          side: "bottom",
          align: "center",
        }),
        edgeAwareStep(moreToggle, {
          title: "Pipeline, metrics, and calendar",
          description:
            "Your quote stages, headline numbers and the job calendar live here, always in view.",
          side: "top",
          align: "center",
        }),
        {
          element: revealMoreTarget(TARGETS.pipeline, pipeline),
          popover: {
            title: "Quote pipeline",
            description: pipeline.matches('[data-testid="dashboard-stage-tiles"]')
              ? "Track each stage from draft to completed. Sending, customer views and acceptance update the quote; you record the job’s later progress. Select a tile to see that stage."
              : "Your first quote will appear here and move through each stage as the job progresses.",
            side: "top",
            align: "center",
          },
        },
        {
          element: revealMoreTarget(TARGETS.calendar, calendar),
          popover: {
            title: "Schedule",
            description:
              "Scheduled jobs and day notes live in this calendar. Select a date to see bookings or add a reminder.",
            side: "top",
            align: "center",
          },
        },
        edgeAwareStep(recent, {
          title: "Your quotes",
          description:
            "Every quote lives in the Quotes tab. Open it to review, edit, send, or create the PDF for any job.",
          side: "bottom",
          align: "center",
        }),
      );

      steps.push(
        edgeAwareStep(navigation, {
          title: "Main navigation",
          description: navigation.matches('[data-testid="app-bottom-nav"]')
            ? "This bottom bar stays pinned to the phone's bottom edge for Home, Quotes, New, Invoices, and Materials."
            : "Use these tabs to move between the main work areas without returning to the dashboard first.",
          side: "top",
          align: "center",
        }),
        edgeAwareStep(materials, {
          title: "Materials library",
          description:
            "Keep commonly used items and prices here so future quote quantities and costs start closer to your real numbers.",
          side: "top",
          align: "center",
        }),
        edgeAwareStep(account, {
          title: "Account and settings",
          description:
            "Set your business name, logo, contact details, rates and document defaults here. Your client list and help guide are available from this menu.",
          side: "left",
          align: "start",
        }),
        {
          popover: {
            title: "You're ready",
            description:
              "Review quantities, rates, GST, client details and terms before you send. Nothing is emailed until you choose Send. Replay this walkthrough from Settings whenever you need it.",
            showButtons: ["previous", "next", "close"],
            doneBtnText: "Get started",
          },
        },
      );

      return steps;
    };

    const destroyDriverWithoutCompletion = () => {
      const current = driverObj;
      driverObj = null;
      if (!current) return;
      suppressDestroyCallback = true;
      try {
        if (current.isActive()) current.destroy();
      } catch {
        // Best-effort cleanup after a Driver startup/runtime failure.
      } finally {
        suppressDestroyCallback = false;
      }
    };

    const kickOff = () => {
      if (cancelled || finished) return;
      try {
        if (!dashboardIsReady()) {
          if (Date.now() - startedAt < MAX_WAIT_MS) {
            schedule(waitForDashboard, POLL_INTERVAL_MS);
          } else {
            abandonTour();
          }
          return;
        }

        const steps = buildSteps();
        if (!steps || steps.length < MIN_COMPLETE_STEP_COUNT) {
          if (Date.now() - startedAt < MAX_WAIT_MS) {
            schedule(waitForDashboard, POLL_INTERVAL_MS);
          } else {
            abandonTour();
          }
          return;
        }

        driverObj = driver({
          showProgress: true,
          progressText: "Step {{current}} of {{total}}",
          allowClose: true,
          overlayClickBehavior: "close",
          overlayOpacity: 0.42,
          stagePadding: 8,
          stageRadius: 12,
          popoverClass: "t2q-tour",
          nextBtnText: "Next",
          prevBtnText: "Back",
          doneBtnText: "Done",
          animate: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          smoothScroll: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
          disableActiveInteraction: true,
          steps,
          onPopoverRender: (popover) => {
            popover.closeButton.setAttribute("aria-label", "Skip tutorial");
          },
          onDestroyed: () => {
            driverObj = null;
            if (cancelled || suppressDestroyCallback) return;
            if (tourStarted) completeTour();
            else abandonTour();
          },
        });
        driverObj.drive();
        tourStarted = true;
      } catch {
        tourStarted = false;
        destroyDriverWithoutCompletion();
        abandonTour();
      }
    };

    const waitForDashboard = () => {
      if (cancelled || finished) return;
      if (dashboardIsReady()) {
        schedule(kickOff, SETTLE_AFTER_READY_MS);
        return;
      }
      if (Date.now() - startedAt >= MAX_WAIT_MS) {
        abandonTour();
        return;
      }
      schedule(waitForDashboard, POLL_INTERVAL_MS);
    };

    waitForDashboard();

    return () => {
      cancelled = true;
      timers.forEach((t) => clearTimeout(t));
      timers.clear();
      destroyDriverWithoutCompletion();
      restoreDashboardMore();
    };
  }, [onFinished]);

  // The tour renders into document.body via Driver.js. This component
  // itself produces no DOM — it just kicks off the driver.
  return null;
}
