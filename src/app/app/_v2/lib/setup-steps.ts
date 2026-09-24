/**
 * The first-visit setup card on the new-look Home: three steps, ticked from
 * real data, each one tap to where it's done. It replaces the welcome video
 * and the coachmark tour in the new look. Pure.
 */

import { NEW_QUOTE_PATH } from "./app-nav";

/** Priced materials before "Set your rates and prices" is done (same bar as the old dashboard banner). */
export const PRICED_MATERIALS_TARGET = 8;

/** Set when the tradie hides the card on this device. */
export const SETUP_DISMISSED_COOKIE = "t2q-setup-dismissed";
export const SETUP_DISMISSED_MAX_AGE_S = 365 * 24 * 60 * 60;

export const BUSINESS_SETTINGS_PATH = "/app/settings/business";
export const RATES_SETTINGS_PATH = "/app/settings/rates";
export const PRICES_QUICK_START_PATH = "/app/materials/quick-start";

export type SetupStepId = "business" | "prices" | "quote";

export interface SetupStep {
  id: SetupStepId;
  label: string;
  /** One plain line under the label; "Done" once it is. */
  hint: string;
  done: boolean;
  href: string;
}

export interface SetupInput {
  businessName: string | null;
  logoUrl: string | null;
  labourRate: number | null;
  pricedMaterials: number;
  quoteCount: number;
}

const filled = (value: string | null | undefined) => typeof value === "string" && value.trim().length > 0;

export function setupSteps(input: SetupInput): SetupStep[] {
  const hasName = filled(input.businessName);
  const hasLogo = filled(input.logoUrl);
  const hasRate = typeof input.labourRate === "number" && input.labourRate > 0;
  const priced = Math.max(0, Math.floor(input.pricedMaterials || 0));
  const hasPrices = priced >= PRICED_MATERIALS_TARGET;

  const business: SetupStep = {
    id: "business",
    label: "Add your business name and logo",
    done: hasName && hasLogo,
    hint:
      hasName && hasLogo
        ? "Done"
        : hasName
          ? "Add your logo to finish"
          : hasLogo
            ? "Add your business name to finish"
            : "They go on every quote and invoice",
    href: BUSINESS_SETTINGS_PATH,
  };

  const prices: SetupStep = {
    id: "prices",
    label: "Set your rates and prices",
    done: hasRate && hasPrices,
    hint:
      hasRate && hasPrices
        ? "Done"
        : !hasRate
          ? "Your labour rate, then your everyday prices"
          : `${priced} of ${PRICED_MATERIALS_TARGET} prices saved`,
    // One tap to the part still missing: the rate first, then the prices.
    href: hasRate ? PRICES_QUICK_START_PATH : RATES_SETTINGS_PATH,
  };

  const quote: SetupStep = {
    id: "quote",
    label: "Make your first quote",
    done: input.quoteCount > 0,
    hint: input.quoteCount > 0 ? "Done" : "Say the job and it's written up for you",
    href: NEW_QUOTE_PATH,
  };

  return [business, prices, quote];
}

/** The step to do next, or null when all three are done. */
export function nextSetupStep(steps: readonly SetupStep[]): SetupStep | null {
  return steps.find((s) => !s.done) ?? null;
}

export function isSetupDismissed(cookieValue: string | null | undefined): boolean {
  return cookieValue === "1";
}

/** Shown until all three are done, or until it is hidden on this device. */
export function showSetupCard(steps: readonly SetupStep[], dismissed: boolean): boolean {
  return !dismissed && steps.some((s) => !s.done);
}

/** "1 of 3 done". */
export function setupProgress(steps: readonly SetupStep[]): string {
  return `${steps.filter((s) => s.done).length} of ${steps.length} done`;
}
