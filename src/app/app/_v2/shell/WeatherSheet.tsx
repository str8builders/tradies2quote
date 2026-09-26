"use client";

import { useId, type ReactNode } from "react";
import { ArrowClockwise, ArrowRight, ClockClockwise, Crosshair } from "@phosphor-icons/react/dist/ssr";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { IconTile } from "@/components/ui/icon-tile";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { cx } from "@/components/ui/cx";
import { TAP } from "@/components/ui/styles";
import { WEATHER_IMPACT_ADVISORY } from "@/lib/weather-impact/config";
import type { WeatherImpactTrade } from "@/lib/weather-impact/types";
import { WeatherIcon } from "./weather-icons";
import {
  CALL_TONE,
  CALL_WORDS,
  CONDITION_WORDS,
  capitalise,
  conditionNow,
  dayName,
  degrees,
  isTrade,
  sourceLine,
  tradeCall,
  upcomingDays,
  type NoWeatherReason,
  type WeatherState,
} from "./weather-now";

type ReadyState = Extract<WeatherState, { kind: "ready" }>;

interface LocateProps {
  onUseLocation: () => void;
  locating: boolean;
  /** Why "Use my location" didn't work, if it didn't. */
  notice: string | null;
}

function UseMyLocation({ onUseLocation, locating, notice }: LocateProps) {
  return (
    <div className="space-y-2">
      <Button
        variant="secondary"
        fullWidth
        icon={<Crosshair weight="bold" />}
        onClick={onUseLocation}
        loading={locating}
        loadingLabel="Finding you…"
        data-testid="weather-use-location"
      >
        Use my location
      </Button>
      {notice ? (
        <p role="alert" className="text-ui-sm font-semibold text-ui-bad">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

function Heading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h3 id={id} className="px-1 text-ui-sm font-semibold text-ui-muted">
      {children}
    </h3>
  );
}

function Ready({
  state,
  trade,
  onTrade,
  ...locate
}: LocateProps & { state: ReadyState; trade: WeatherImpactTrade; onTrade: (trade: WeatherImpactTrade) => void }) {
  const id = useId();
  const { reading, today } = state;
  const { weather } = reading;
  const condition = conditionNow(weather, today);
  const temp = degrees(weather.current.temperatureC);
  const facts = [
    weather.current.windGustKph == null ? null : `Gusts ${Math.round(weather.current.windGustKph)} kph`,
    weather.current.rainProbabilityPct == null ? null : `Rain chance ${Math.round(weather.current.rainProbabilityPct)}%`,
  ].filter(Boolean);
  const call = tradeCall(weather, trade);
  const others = weather.trades.filter((t) => t.id !== call?.id);
  const days = upcomingDays(weather.days, today);

  return (
    <div className="space-y-5" data-testid="weather-impact" data-source={reading.source}>
      <section aria-labelledby={`${id}-now`} className="flex items-center gap-4" data-testid="weather-now">
        <IconTile icon={<WeatherIcon condition={condition} weight="duotone" />} tone="info" size="lg" />
        <div className="min-w-0 flex-1">
          <h3 id={`${id}-now`} className="text-ui-sm font-semibold text-ui-muted">
            Right now
          </h3>
          <p className="flex flex-wrap items-baseline gap-x-2 text-ui-lg font-semibold text-ui-text">
            {temp ? <span className="ui-heading text-ui-2xl tabular-nums">{temp}</span> : null}
            <span>{capitalise(CONDITION_WORDS[condition])}</span>
          </p>
          {facts.length > 0 ? <p className="text-ui-sm text-ui-muted">{facts.join(" · ")}</p> : null}
        </div>
      </section>

      {reading.source === "base" ? <UseMyLocation {...locate} /> : null}

      {call ? (
        <section aria-labelledby={`${id}-trade`} className="space-y-2" data-testid="weather-your-trade" data-call={call.status}>
          <div className="px-1">
            <h3 id={`${id}-trade`} className="text-ui-base font-semibold text-ui-text">
              Your trade
            </h3>
            <p className="text-ui-sm text-ui-muted">Tap yours to see what the weather means for your work.</p>
          </div>
          <div role="radiogroup" aria-labelledby={`${id}-trade`} data-testid="weather-trade-picker" className="flex flex-wrap gap-2">
            {weather.trades.map((t) => {
              const on = t.id === call.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-trade={t.id}
                  onClick={() => {
                    if (isTrade(t.id)) onTrade(t.id);
                  }}
                  className={cx(
                    "ui-focus-ring min-h-11 rounded-full px-4 text-ui-sm font-semibold",
                    TAP,
                    on ? "bg-ui-brand text-ui-on-brand" : "border-2 border-ui-line-strong bg-ui-surface text-ui-text",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
          <Card className="space-y-3">
            <div className="flex items-start gap-3">
              <StatusPill tone={CALL_TONE[call.status]}>{CALL_WORDS[call.status]}</StatusPill>
              <p className="min-w-0 flex-1 pt-1 text-ui-base text-ui-text">{call.reason}</p>
            </div>
            {call.betterWindow ? (
              <p className="flex items-start gap-2 text-ui-sm text-ui-text" data-testid="weather-better-window">
                <ClockClockwise aria-hidden="true" weight="duotone" className="mt-0.5 shrink-0 text-[1.25rem] text-ui-info" />
                <span>{call.betterWindow}</span>
              </p>
            ) : null}
          </Card>
        </section>
      ) : null}

      {others.length > 0 ? (
        <section aria-labelledby={`${id}-others`} className="space-y-2">
          <Heading id={`${id}-others`}>Other trades</Heading>
          <Card padding="none">
            <ul className="divide-y divide-ui-line" data-testid="weather-other-trades">
              {others.map((t) => (
                <li key={t.id} data-trade={t.id} data-call={t.status} className="flex items-start gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold break-words text-ui-text">{t.label}</span>
                    <span className="block text-ui-sm text-ui-muted">{t.reason}</span>
                  </span>
                  <StatusPill tone={CALL_TONE[t.status]}>{CALL_WORDS[t.status]}</StatusPill>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {days.length > 0 ? (
        <section aria-labelledby={`${id}-days`} className="space-y-2">
          <Heading id={`${id}-days`}>{days.length === 5 ? "Next 5 days" : "Next few days"}</Heading>
          <Card padding="none">
            <ul className="divide-y divide-ui-line" data-testid="weather-days">
              {days.map((d) => (
                <li key={d.date} data-day={d.date} className="flex min-h-14 items-center gap-3 px-4 py-2">
                  <span className="w-20 shrink-0 font-semibold text-ui-text">{dayName(d.date, today)}</span>
                  <WeatherIcon condition={d.condition} weight="duotone" className="shrink-0 text-[1.5rem] text-ui-info" />
                  <span className="w-10 shrink-0 font-semibold tabular-nums text-ui-text">{degrees(d.tempMaxC) ?? ""}</span>
                  <span className="min-w-0 flex-1 text-ui-sm text-ui-muted">{d.status === "safe" ? "" : d.reason}</span>
                  <StatusPill tone={CALL_TONE[d.status]}>{CALL_WORDS[d.status]}</StatusPill>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <p className="px-1 text-ui-sm text-ui-muted">{WEATHER_IMPACT_ADVISORY}</p>
    </div>
  );
}

function NoWeather({ reason, onEditAddress, ...locate }: LocateProps & { reason: NoWeatherReason; onEditAddress: () => void }) {
  const notFound = reason === "not-found";
  return (
    <div className="space-y-4" data-testid="weather-none">
      <Callout tone="info" title={notFound ? "We couldn't find your business address on the map" : "No location for the weather yet"}>
        {notFound
          ? "Check the address in your business details, or use your phone's location."
          : "Add your business address, or use your phone's location."}
      </Callout>
      <UseMyLocation {...locate} />
      <ButtonLink href="/app/settings/business" variant="ghost" fullWidth onClick={onEditAddress}>
        {notFound ? "Check your business address" : "Add your business address"}
      </ButtonLink>
    </div>
  );
}

export interface WeatherSheetProps extends LocateProps {
  open: boolean;
  onClose: () => void;
  state: WeatherState;
  trade: WeatherImpactTrade;
  onTrade: (trade: WeatherImpactTrade) => void;
  onRetry: () => void;
  /** Off to Business details to add the address (defaults to closing). */
  onEditAddress?: () => void;
}

/**
 * "Weather impact": now, your trade's call first (with a better window
 * when there is one), every other trade, the next five days, and the way
 * to the full weather page. Offers the phone's location when the forecast
 * is for the business address.
 */
export function WeatherSheet({ open, onClose, state, trade, onTrade, onRetry, onEditAddress, ...locate }: WeatherSheetProps) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Weather impact"
      description={state.kind === "ready" ? sourceLine(state.reading) : undefined}
      footer={
        <ButtonLink href="/app/weather" variant="secondary" fullWidth iconEnd={<ArrowRight weight="bold" />} onClick={onClose}>
          Full weather
        </ButtonLink>
      }
    >
      {state.kind === "ready" ? <Ready state={state} trade={trade} onTrade={onTrade} {...locate} /> : null}
      {state.kind === "none" ? <NoWeather reason={state.reason} onEditAddress={onEditAddress ?? onClose} {...locate} /> : null}
      {state.kind === "error" ? (
        <Callout
          tone="warn"
          title="Weather's not available right now"
          action={
            <Button variant="secondary" icon={<ArrowClockwise weight="bold" />} onClick={onRetry} data-testid="weather-retry">
              Try again
            </Button>
          }
        >
          The forecast didn&apos;t come through. Check your signal, or try again in a minute.
        </Callout>
      ) : null}
      {state.kind === "loading" ? (
        <div aria-busy="true" className="space-y-3" data-testid="weather-loading">
          <p className="text-ui-base text-ui-muted">Getting the weather…</p>
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : null}
    </BottomSheet>
  );
}
