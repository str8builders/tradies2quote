import type { Metadata } from "next";
import { cookies } from "next/headers";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OutdoorModeToggle } from "@/components/ui/outdoor-mode-toggle";
import { SectionTitle } from "@/components/ui/section-title";
import { ToastProvider } from "@/components/ui/toast";
import {
  OUTDOOR_COOKIE,
  contrastAttributeValue,
  isOutdoorCookieValue,
} from "@/lib/ui/outdoor";
import { UI_DURATION, UI_RADIUS } from "@/lib/ui/tokens";
import { ExampleScreens } from "./_components/ExampleScreens";
import { KitDemos } from "./_components/KitDemos";
import { KitSection } from "./_components/KitSection";
import { Swatches } from "./_components/Swatches";
import { TypeScale } from "./_components/TypeScale";

/**
 * /ui-kit — the redesign's parts kit (phase 1). Public so the owner can check
 * it on a phone without signing in, but kept out of search: noindex here,
 * disallowed in robots.txt, not in the sitemap. Made-up data only; nothing on
 * the page reads or writes the database.
 */
export const metadata: Metadata = {
  title: "UI kit",
  description: "The parts the new Tradies2Quote screens are built from. Made-up data only.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
  alternates: { canonical: "/ui-kit" },
};

const RULES = [
  ["One screen, one job", "One big orange button at the bottom, where the thumb is."],
  ["Plain words", "“Send quote”, “Needs your price”. No codes and no “//” labels."],
  ["Built for site", "Body text 17 px, captions no smaller than 13 px, main buttons 56 px, every other target at least 48 px."],
  ["Always shows what's next", "Every job has a progress line, and the big button is the next step."],
  ["Simple first, detail on tap", "Extra tools and detail open in a sheet instead of crowding the page."],
  ["One look everywhere", "One card style, three button sizes, one set of colours, corners, shadows and spacing."],
] as const;

const JUMPS = [
  ["colours", "Colours"],
  ["type", "Text"],
  ["buttons", "Buttons"],
  ["cards", "Cards"],
  ["progress", "Progress"],
  ["bars", "Sheets"],
  ["entry", "Keypad"],
  ["screens", "Example screens"],
] as const;

const px = (rem: string) => `${Math.round(parseFloat(rem) * 16)} px`;

/** Written out in full so Tailwind generates each one. */
const RADIUS_CLASS: Record<keyof typeof UI_RADIUS, string> = {
  sm: "rounded-ui-sm",
  md: "rounded-ui-md",
  lg: "rounded-ui-lg",
  xl: "rounded-ui-xl",
};

export default async function UiKitPage() {
  const outdoor = isOutdoorCookieValue((await cookies()).get(OUTDOOR_COOKIE)?.value);

  return (
    <div
      data-contrast-root=""
      data-contrast={contrastAttributeValue(outdoor)}
      className="relative isolate min-h-dvh bg-ui-bg font-ui-sans font-ui-body text-ui-base text-ui-text [color-scheme:var(--ui-color-scheme)]"
    >
      <header
        data-kit-header=""
        className="sticky top-0 z-30 border-b border-ui-line bg-ui-bg pt-[env(safe-area-inset-top)]"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4">
          <p className="ui-title shrink-0 text-ui-lg">Parts kit</p>
          <OutdoorModeToggle initialOn={outdoor} compact className="ml-auto" />
        </div>
      </header>

      <ToastProvider>
        <main className="mx-auto max-w-6xl px-4 pb-[max(env(safe-area-inset-bottom),2.5rem)]">
          <div className="pt-8 pb-10">
            <SectionTitle
              size="page"
              description="Every part the new screens are built from, in one place. Everything here is made up: nothing reads or saves your data."
            >
              The new look, part by part
            </SectionTitle>
            <nav aria-label="On this page" className="mt-5">
              <ul className="flex flex-wrap gap-2">
                {JUMPS.map(([id, label]) => (
                  <li key={id}>
                    <ButtonLink href={`#${id}`} variant="secondary" size="sm">
                      {label}
                    </ButtonLink>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="mt-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
              <Card padding="lg">
                <h2 className="ui-title text-ui-lg">Six rules every new screen follows</h2>
                <ol className="mt-3 grid gap-3 sm:grid-cols-2">
                  {RULES.map(([title, body], i) => (
                    <li key={title} className="flex gap-3">
                      <span
                        aria-hidden="true"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-ui-sm bg-ui-brand-soft font-semibold text-ui-brand-text"
                      >
                        {i + 1}
                      </span>
                      <span>
                        <span className="block font-semibold">{title}</span>
                        <span className="block text-ui-sm text-ui-muted">{body}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </Card>
              <Card padding="lg">
                <h2 className="ui-title text-ui-lg">Outdoor mode</h2>
                <p className="mt-2 text-ui-muted">
                  A black-on-white palette with stronger contrast for bright sun, saved on each phone. Only
                  the new parts change; today&apos;s screens stay exactly as they are.
                </p>
                <p className="mt-3 text-ui-sm text-ui-muted">
                  Use the switch at the top of the page to compare the two.
                </p>
              </Card>
            </div>
          </div>

          <KitSection
            id="colours"
            title="Colours"
            description="Every colour comes from these tokens. Text colours are tested for contrast in both palettes."
          >
            <Swatches />
          </KitSection>

          <KitSection id="type" title="Text sizes" description="IBM Plex Sans for reading, Archivo Black for big headings.">
            <TypeScale />
          </KitSection>

          <KitSection
            id="shape"
            title="Corners, shadows and movement"
            description={`Movement explains what just happened: ${UI_DURATION.fast} to ${UI_DURATION.slow}, sliding or fading only, and none at all when a phone asks for reduced motion.`}
          >
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(Object.keys(UI_RADIUS) as Array<keyof typeof UI_RADIUS>).map((name) => (
                <div
                  key={name}
                  className={`flex h-24 flex-col justify-end border-2 border-ui-line-strong bg-ui-surface p-3 ${RADIUS_CLASS[name]}`}
                >
                  <span className="font-semibold">rounded-ui-{name}</span>
                  <span className="text-ui-sm text-ui-muted">{px(UI_RADIUS[name])} corners</span>
                </div>
              ))}
              <div className="flex h-24 flex-col justify-end rounded-ui-lg bg-ui-surface p-3 shadow-ui-card">
                <span className="font-semibold">shadow-ui-card</span>
                <span className="text-ui-sm text-ui-muted">Cards</span>
              </div>
              <div className="flex h-24 flex-col justify-end rounded-ui-lg bg-ui-surface p-3 shadow-ui-raised">
                <span className="font-semibold">shadow-ui-raised</span>
                <span className="text-ui-sm text-ui-muted">Main button, toasts</span>
              </div>
              <div className="flex h-24 flex-col justify-end rounded-ui-lg bg-ui-surface p-3 shadow-ui-sheet">
                <span className="font-semibold">shadow-ui-sheet</span>
                <span className="text-ui-sm text-ui-muted">Sheets</span>
              </div>
            </div>
          </KitSection>

          <KitDemos />

          <KitSection
            id="screens"
            title="Example screens"
            description="Four screens built only from the parts above, with a made-up job. Tap around: nothing is saved."
          >
            <ExampleScreens />
          </KitSection>

          <p className="border-t border-ui-line pt-6 text-ui-sm text-ui-muted">
            Names, jobs and amounts on this page are made up. The page is hidden from search engines.
          </p>
        </main>
      </ToastProvider>
    </div>
  );
}
