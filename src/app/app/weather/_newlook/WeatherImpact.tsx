"use client";

import { useEffect, useId } from "react";
import type { Icon } from "@phosphor-icons/react";
import {
  ArrowClockwise,
  ClockClockwise,
  Crosshair,
  MapPin,
  ShieldCheck,
  SpinnerGap,
  Warning,
  XCircle,
} from "@phosphor-icons/react/dist/ssr";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { SectionTitle } from "@/components/ui/section-title";
import { StatusPill } from "@/components/ui/status-pill";
import { TAP } from "@/components/ui/styles";
import { TextField } from "@/components/ui/text-field";
import { Toggle } from "@/components/ui/toggle";
import { ALL_CLEAR_REASON, TRADE_OPTIONS } from "@/lib/weather-impact/config";
import { NO_THRESHOLDS_REASON } from "@/lib/weather-impact/evaluate";
import type { WeatherDailyForecast, WeatherImpactStatus, WeatherImpactTrade } from "@/lib/weather-impact/types";
import { WeatherIcon } from "@/app/app/_v2/shell/weather-icons";
import {
  CONDITION_WORDS,
  TRADE_KEY,
  capitalise,
  dayName,
  degrees,
  isTrade,
  saveTrade,
  type StorageLike,
} from "@/app/app/_v2/shell/weather-now";
import { SelectField } from "../../settings/_newlook/fields";
import {
  CONTEXT_TOGGLES,
  WEATHER_FIELDS,
  formatObserved,
  useWeatherImpact,
  type WeatherImpactProps,
  type WeatherImpactState,
} from "../_components/WeatherImpactClient";

/** The call, big: the old look's words in the kit's tones. */
const VERDICT: Readonly<Record<WeatherImpactStatus, { title: string; Icon: Icon; box: string; icon: string }>> = {
  safe: { title: "Safe to work", Icon: ShieldCheck, box: "border-ui-ok bg-ui-ok-soft", icon: "text-ui-ok" },
  caution: { title: "Use caution", Icon: Warning, box: "border-ui-warn bg-ui-warn-soft", icon: "text-ui-warn" },
  unsafe: { title: "Not safe to work", Icon: XCircle, box: "border-ui-bad bg-ui-bad-soft", icon: "text-ui-bad" },
};

/** Degrees as the rest of the new-look weather writes them. */
const UNIT: Readonly<Record<string, string>> = { "deg C": "°C" };

type ViewProps = WeatherImpactProps & {
  w: WeatherImpactState;
  /** Picking a trade here (the page also remembers it for the weather sheet). */
  onTrade?: (trade: WeatherImpactTrade) => void;
};

/** The engine's all-clear in the weather sheet's words; any other reason as it is. */
export function plainReasons(reasons: readonly string[]): string[] {
  return reasons.map((reason) => (reason === NO_THRESHOLDS_REASON ? ALL_CLEAR_REASON : reason));
}

/** The trade picked in the weather sheet on this phone, if one was (else the page starts on roofing). */
export function rememberedTrade(storage: StorageLike | null): WeatherImpactTrade | null {
  try {
    const value = storage?.getItem(TRADE_KEY);
    return isTrade(value) ? value : null;
  } catch {
    return null;
  }
}

function phoneStorage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * "Weather impact" in the new look: the old look's check (useWeatherImpact)
 * drawn with the kit. The job picks where the weather is for; then the call
 * for your trade with its reasons, what to do, the next five days, and the
 * site and conditions behind the call (all editable).
 */
export function WeatherImpact(props: WeatherImpactProps) {
  const w = useWeatherImpact(props);
  const { setTrade } = w;
  // One "your trade" across the weather sheet and this page. Read after
  // mount (storage isn't there on the server), off the effect body.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const saved = rememberedTrade(phoneStorage());
      if (saved) setTrade(saved);
    }, 0);
    return () => window.clearTimeout(t);
  }, [setTrade]);
  const pickTrade = (trade: WeatherImpactTrade) => {
    setTrade(trade);
    saveTrade(phoneStorage(), trade);
  };
  return <WeatherImpactView {...props} w={w} onTrade={pickTrade} />;
}

/** Any state of the check, drawn. A plain function of the state, so each one renders in tests. */
export function WeatherImpactView(props: ViewProps) {
  const { w } = props;
  const days = w.weather.daily ?? [];
  return (
    <div className="space-y-6" data-testid="weather-check" data-state={w.fetchState}>
      <p className="px-1 text-ui-base text-ui-muted">
        Pick the job and its live weather loads. Your trade and the site decide the call, with the reasons.
      </p>
      <JobSite {...props} />
      <Verdict w={w} />
      <YourTrade trade={w.trade} onTrade={props.onTrade ?? w.setTrade} />
      <Findings title="Why?" items={plainReasons(w.result.reasons)} empty="No weather rule has fired yet." testId="weather-why" />
      <Findings
        title="Recommended actions"
        items={w.result.controls}
        empty="Keep monitoring conditions."
        testId="weather-actions"
      />
      <div className="grid gap-6 sm:grid-cols-2">
        <Findings
          title="Blocked tasks"
          items={w.result.blocked_tasks}
          empty="No blocked tasks from weather rules."
          testId="weather-blocked"
        />
        <Findings
          title="Still useful"
          items={w.result.safe_tasks}
          empty="Add current conditions to see suggested safe tasks."
          testId="weather-still-useful"
        />
      </div>
      <BetterWindow text={w.result.next_better_window} />
      {/* The outlook comes with live weather only (manual entry has none). */}
      {days.length > 0 ? <NextDays days={days} locationFor={w.locationFor} /> : null}
      <Site w={w} />
      <Conditions w={w} />
      <p className="px-1 text-ui-sm text-ui-muted">{w.result.advisory}</p>
    </div>
  );
}

/**
 * Where the weather is for: the job on record (its client's address), or,
 * only when asked, the phone's own position, marked as not the job site.
 */
function JobSite({ jobOptions, selectedQuoteId, jobLocation, geocodeFailed, w }: ViewProps) {
  const id = useId();
  const loading = w.fetchState === "loading";
  return (
    <Card as="section" aria-labelledby={id} className="space-y-4" data-testid="weather-job">
      <SectionTitle id={id} description="The weather loads for the client's address on the job.">
        Job site
      </SectionTitle>
      {jobOptions.length > 0 ? (
        <div className="space-y-3">
          <SelectField
            label="Which job is this for?"
            value={selectedQuoteId ?? ""}
            onChange={(event) => w.pickJob(event.target.value)}
            options={[
              // Short enough to fit the closed box on a phone; the call says it's manual entry.
              { value: "", label: "No job picked" },
              ...jobOptions.map((option) => ({
                value: option.id,
                label: option.scheduled ? `Scheduled: ${option.label}` : option.label,
              })),
            ]}
            data-testid="weather-job-picker"
          />
          {jobLocation ? (
            <p className="text-ui-base text-ui-text">
              Live weather loads for <span className="font-semibold">{jobLocation.matchedName}</span> (from the
              job&apos;s client address).
            </p>
          ) : null}
          {geocodeFailed ? (
            <Callout tone="warn" title="Couldn't place this job's address on the map.">
              Enter conditions manually, or use your device location below (clearly marked as not the job site).
            </Callout>
          ) : null}
        </div>
      ) : (
        <p className="text-ui-base text-ui-muted">
          No quotes with a client address yet — add the client&apos;s address on a quote and it&apos;ll appear
          here. You can still enter conditions manually below.
        </p>
      )}
      {loading && jobLocation ? (
        <p role="status" className="flex items-center gap-2 text-ui-base text-ui-muted" data-testid="weather-loading">
          <SpinnerGap
            aria-hidden="true"
            weight="bold"
            className="shrink-0 animate-spin text-[1.25rem] motion-reduce:animate-spin-calm"
          />
          Loading live weather for {jobLocation.matchedName}…
        </p>
      ) : null}
      {w.fetchError ? (
        <div role="alert">
          <Callout
            tone="warn"
            title={w.fetchError}
            action={
              jobLocation ? (
                <Button
                  variant="secondary"
                  icon={<ArrowClockwise weight="bold" />}
                  onClick={w.retryJobWeather}
                  data-testid="weather-retry-job"
                >
                  Retry job-site weather
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : null}
      <div className="space-y-2 border-t border-ui-line pt-4">
        <Button
          variant="secondary"
          fullWidth
          icon={<Crosshair weight="bold" />}
          onClick={w.loadDeviceWeather}
          loading={loading}
          data-testid="weather-device-location"
        >
          Use my device location
        </Button>
        <p className="text-ui-sm text-ui-muted">Device location is your phone&apos;s position — not the job site.</p>
      </div>
    </Card>
  );
}

/** The call, the numbers it came from, and which location they are for (always shown). */
function Verdict({ w }: { w: WeatherImpactState }) {
  const id = useId();
  const { result, weather, locationFor } = w;
  const verdict = VERDICT[result.overall_status];
  return (
    <section
      aria-labelledby={id}
      aria-busy={w.fetchState === "loading" || undefined}
      data-testid="weather-verdict"
      data-status={result.overall_status}
      className={cx("space-y-3 rounded-ui-lg border-2 p-4", verdict.box)}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={cx("inline-flex shrink-0 text-[2.25rem]", verdict.icon)}>
          <verdict.Icon weight="fill" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={id} className="ui-title text-ui-xl text-ui-text">
            {verdict.title}
          </h2>
          <p className="mt-1 text-ui-base text-ui-text">{result.weather_summary}</p>
        </div>
      </div>
      <p className="flex items-start gap-2 text-ui-sm font-semibold text-ui-text" data-testid="weather-for">
        <MapPin aria-hidden="true" weight="bold" className="mt-0.5 shrink-0 text-[1.125rem]" />
        <span className="min-w-0 break-words">{`Weather for: ${locationFor ?? "manual entry (no live location)"}`}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <StatusPill>{`Score ${result.severity_score}/100`}</StatusPill>
        <StatusPill>
          {result.confidence === "degraded" ? "Incomplete weather data" : (weather.source ?? "Manual conditions")}
        </StatusPill>
        {weather.observedAt ? <StatusPill>{`Observed ${formatObserved(weather.observedAt)}`}</StatusPill> : null}
      </div>
    </section>
  );
}

/**
 * Your trade as chips, drawn like the weather sheet's trade picker (the same
 * radio buttons), for every trade the check knows.
 */
function YourTrade({ trade, onTrade }: { trade: WeatherImpactTrade; onTrade: (trade: WeatherImpactTrade) => void }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-3" data-testid="weather-trade">
      <SectionTitle id={id} description="Tap yours to see what the weather means for your work.">
        Your trade
      </SectionTitle>
      <div role="radiogroup" aria-labelledby={id} data-testid="weather-trade-picker" className="flex flex-wrap gap-2">
        {TRADE_OPTIONS.map((option) => {
          const on = option.value === trade;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={on}
              data-trade={option.value}
              onClick={() => onTrade(option.value)}
              className={cx(
                "ui-focus-ring min-h-11 rounded-full px-4 text-ui-sm font-semibold",
                TAP,
                on ? "bg-ui-brand text-ui-on-brand" : "border-2 border-ui-line-strong bg-ui-surface text-ui-text",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Findings({ title, items, empty, testId }: { title: string; items: string[]; empty: string; testId: string }) {
  const id = useId();
  return (
    <Card as="section" aria-labelledby={id} className="space-y-3" data-testid={testId}>
      <SectionTitle id={id}>{title}</SectionTitle>
      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item} className="flex gap-3 text-ui-base text-ui-text">
              <span aria-hidden="true" className="mt-2.5 h-2 w-2 shrink-0 rounded-full bg-ui-brand" />
              <span className="min-w-0">{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ui-base text-ui-muted">{empty}</p>
      )}
    </Card>
  );
}

function BetterWindow({ text }: { text: string | null }) {
  const id = useId();
  return (
    <Card as="section" aria-labelledby={id} className="space-y-3" data-testid="weather-better-window">
      <SectionTitle id={id}>Better window</SectionTitle>
      {text ? (
        <p className="flex items-start gap-2 text-ui-base text-ui-text">
          <ClockClockwise aria-hidden="true" weight="duotone" className="mt-0.5 shrink-0 text-[1.25rem] text-ui-info" />
          <span>{text}</span>
        </p>
      ) : (
        <p className="text-ui-base text-ui-muted">No better 3-hour window found in the available forecast yet.</p>
      )}
    </Card>
  );
}

/** The next five days at the site, one row a day, with the weather sheet's icons and day names. */
function NextDays({ days, locationFor }: { days: WeatherDailyForecast[]; locationFor: string | null }) {
  const id = useId();
  const shown = days.slice(0, 5);
  // The forecast runs on the site's own calendar, so its first day is the site's today.
  const today = shown[0]?.date ?? "";
  return (
    <section aria-labelledby={id} className="space-y-3" data-testid="weather-5day">
      <SectionTitle id={id} description={locationFor ?? undefined}>
        {shown.length === 5 ? "Next 5 days" : "Next few days"}
      </SectionTitle>
      <Card padding="none">
        <ul className="divide-y divide-ui-line">
          {shown.map((day) => {
            const wet = day.condition === "rain" || day.condition === "thunderstorm";
            const gust = day.windGustMaxKph;
            return (
              <li key={day.date} data-day={day.date} className="flex min-h-16 items-center gap-3 px-4 py-2">
                <span className="w-20 shrink-0 font-semibold text-ui-text">{dayName(day.date, today)}</span>
                <WeatherIcon condition={day.condition} weight="duotone" className="shrink-0 text-[1.5rem] text-ui-info" />
                <span className="min-w-0 flex-1 text-ui-sm">
                  <span className="block text-ui-text">{capitalise(CONDITION_WORDS[day.condition])}</span>
                  {day.rainProbabilityMaxPct != null ? (
                    <span className={cx("block", wet ? "font-semibold text-ui-info" : "text-ui-muted")}>
                      {`Rain ${Math.round(day.rainProbabilityMaxPct)}%`}
                    </span>
                  ) : null}
                  {gust != null && gust >= 50 ? (
                    <span className="block font-semibold text-ui-warn">{`Gusts ${Math.round(gust)} kph`}</span>
                  ) : null}
                </span>
                <span className="shrink-0 text-right tabular-nums">
                  <span className="font-semibold text-ui-text">{degrees(day.tempMaxC) ?? "—"}</span>{" "}
                  <span className="text-ui-muted">{degrees(day.tempMinC) ?? "—"}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

/** What's going on at the site: each one can tighten the call. */
function Site({ w }: { w: WeatherImpactState }) {
  const id = useId();
  return (
    <Card as="section" aria-labelledby={id} className="space-y-2" data-testid="weather-site">
      <SectionTitle id={id} description="What's happening on site changes the call.">
        The site
      </SectionTitle>
      <div className="divide-y divide-ui-line">
        {CONTEXT_TOGGLES.map((toggle) => (
          <Toggle
            key={toggle.key}
            label={toggle.label}
            checked={w.context[toggle.key]}
            onChange={(checked) => w.setContext((current) => ({ ...current, [toggle.key]: checked }))}
            className="py-1"
          />
        ))}
      </div>
    </Card>
  );
}

/** The numbers behind the call: filled in by a live fetch, or typed. */
function Conditions({ w }: { w: WeatherImpactState }) {
  const id = useId();
  return (
    <Card as="section" aria-labelledby={id} className="space-y-4" data-testid="weather-conditions">
      <SectionTitle id={id} description="Filled in from the live weather, or type your own.">
        Conditions
      </SectionTitle>
      <div className="grid grid-cols-2 gap-3">
        {WEATHER_FIELDS.map((field) => (
          <TextField
            key={field.key}
            label={field.label}
            type="number"
            inputMode="decimal"
            step={field.step}
            value={w.weather[field.key] ?? ""}
            onChange={(event) => w.updateWeatherNumber(field.key, event.target.value)}
            suffix={UNIT[field.suffix] ?? field.suffix}
          />
        ))}
      </div>
      <Toggle
        label="Lightning / thunderstorm risk"
        checked={w.weather.thunderstormRisk === true}
        onChange={(checked) => w.setWeather((current) => ({ ...current, thunderstormRisk: checked }))}
      />
    </Card>
  );
}
