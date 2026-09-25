import { Suspense } from "react";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Screen } from "@/components/ui/screen";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";
import { isWeatherImpactEnabled } from "@/lib/weather-impact/feature-flag";
import { businessTimeZone, dayKeyInZone } from "../lib/dates";
import { buildTodos, moneyTiles, todoSummary } from "../lib/home-todos";
import { loadBoard, loadHomeExtras } from "../lib/load-board";
import { SETUP_DISMISSED_COOKIE, isSetupDismissed, setupSteps, showSetupCard } from "../lib/setup-steps";
import type { TopBarData } from "../lib/top-bar";
import { TabTopBar } from "../shell/TabTopBar";
import { HomeSkeleton, HomeView, type HomeViewProps } from "./HomeParts";
import { WeatherLine } from "./WeatherLine";

/** The request's clock, outside the component body (react-hooks/purity). */
function requestTime(): Date {
  return new Date();
}

export interface HomeData extends Omit<HomeViewProps, "weather"> {
  /** Where the weather line is for, or null for none. */
  weather: { address: string; todayKey: string | null; href: string | null } | null;
}

/**
 * Everything Home shows, from the same reads as the dashboard and the lists.
 * Separate from the markup so it can be tested with a fake database.
 */
export async function loadHomeData({
  db,
  userId,
  isOwner,
  now,
  setupDismissed,
}: {
  db: Pick<SupabaseClient, "from">;
  userId: string;
  isOwner: boolean;
  now: Date;
  setupDismissed: boolean;
}): Promise<HomeData> {
  const [board, extras] = await Promise.all([
    loadBoard(db, userId, "app/home"),
    loadHomeExtras(db, userId, { withSetup: !setupDismissed }),
  ]);
  const { profile } = extras;
  const timeZone = businessTimeZone(profile.country, profile.currency);
  const hasJobs = board.quotes.length > 0;

  const todos = board.failed
    ? []
    : buildTodos({ quotes: board.quotes, invoices: board.invoices, requests: extras.requests, now, timeZone });
  const steps = setupSteps({
    businessName: profile.businessName,
    logoUrl: profile.logoUrl,
    labourRate: profile.labourRate,
    pricedMaterials: extras.pricedMaterials ?? 0,
    quoteCount: board.quotes.length,
  });
  const setup = !board.failed && showSetupCard(steps, setupDismissed) ? steps : null;
  const currency = profile.currency ?? board.quotes[0]?.currency ?? "NZD";

  return {
    summary: board.failed
      ? "Your jobs didn't load"
      : setup && !hasJobs
        ? "Let's get you set up"
        : todoSummary(todos.length),
    setup,
    todos,
    hasJobs,
    tiles: hasJobs && !board.failed ? moneyTiles({ invoices: board.invoices, now, timeZone, currency }) : null,
    failed: board.failed,
    weather: profile.address
      ? {
          address: profile.address,
          todayKey: dayKeyInZone(now, timeZone),
          href: isWeatherImpactEnabled(isOwner) ? "/app/weather" : null,
        }
      : null,
  };
}

async function HomeBody({ userId, isOwner }: { userId: string; isOwner: boolean }) {
  const { weather, ...view } = await loadHomeData({
    db: await createClient(),
    userId,
    isOwner,
    now: requestTime(),
    setupDismissed: isSetupDismissed((await cookies()).get(SETUP_DISMISSED_COOKIE)?.value),
  });
  return (
    <HomeView
      {...view}
      weather={
        weather ? (
          <Suspense fallback={<Skeleton shape="line" className="h-9 w-48 rounded-full" />}>
            <WeatherLine address={weather.address} todayKey={weather.todayKey} href={weather.href} variant="chip" />
          </Suspense>
        ) : null
      }
    />
  );
}

/**
 * /app in the new look (src/app/app/page.tsx switches here when
 * isNewLookOn()). The top bar (your photo, the greeting, T2QCAL) paints at
 * once; the day streams in behind a skeleton.
 */
export function NewHome({ userId, isOwner, bar }: { userId: string; isOwner: boolean; bar: TopBarData }) {
  return (
    <Screen height="fill" data-testid="new-home">
      <main className="mx-auto w-full max-w-2xl px-4 pt-6 pb-10 sm:px-6 sm:pt-10">
        <TabTopBar data={bar} />
        <div className="mt-5">
          <Suspense fallback={<HomeSkeleton />}>
            <HomeBody userId={userId} isOwner={isOwner} />
          </Suspense>
        </div>
      </main>
    </Screen>
  );
}
