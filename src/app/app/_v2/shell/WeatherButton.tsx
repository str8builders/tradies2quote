"use client";

import { useEffect, useRef, useState } from "react";
import { CloudSlash, CloudSun } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/components/ui/cx";
import { PRESS, TAP, UI_TEXT } from "@/components/ui/styles";
import { currentFix, hasNativeLocation, nativeLocation } from "@/lib/location/device";
import type { WeatherImpactStatus, WeatherImpactTrade } from "@/lib/weather-impact/types";
import { WeatherIcon } from "./weather-icons";
import {
  DEFAULT_TRADE,
  WEATHER_TTL_MS,
  conditionNow,
  degrees,
  forgetBase,
  locationAlreadyAllowed,
  readTrade,
  resolveWeather,
  saveTrade,
  tradeCall,
  weatherButtonLabel,
  weatherFromPhone,
  type StorageLike,
  type WeatherDeps,
  type WeatherState,
} from "./weather-now";
import { WeatherSheet } from "./WeatherSheet";

const DOT: Readonly<Record<WeatherImpactStatus, string>> = { safe: "bg-ui-ok", caution: "bg-ui-warn", unsafe: "bg-ui-bad" };
const GLYPH = "text-[1.625rem]";

export const NO_FIX_NOTICE = "Your phone couldn't find you. Check location is allowed for Tradies2Quote, then try again.";

function storage(kind: "sessionStorage" | "localStorage"): StorageLike | null {
  try {
    return window[kind];
  } catch {
    return null;
  }
}

async function getJson(url: string): Promise<{ ok: boolean; status: number; body: unknown }> {
  try {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    const body: unknown = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: null };
  }
}

/** The browser's side of the weather. Only from effects and taps, never while rendering. */
function browserDeps(): WeatherDeps {
  return {
    storage: storage("sessionStorage"),
    now: () => Date.now(),
    locationAllowed: () =>
      locationAlreadyAllowed({
        native: hasNativeLocation(),
        nativePermission: () => nativeLocation.permission(),
        permissions: typeof navigator === "undefined" ? null : navigator.permissions,
      }),
    currentFix,
    getJson,
  };
}

/** What sits in the button: the condition, the temperature, and your trade's call as a dot. */
function WeatherFace({ state, trade }: { state: WeatherState; trade: WeatherImpactTrade }) {
  if (state.kind === "ready") {
    const { weather } = state.reading;
    const call = tradeCall(weather, trade);
    const temp = degrees(weather.current.temperatureC);
    return (
      <>
        <span className={cx("relative inline-flex text-ui-text", GLYPH)}>
          <WeatherIcon condition={conditionNow(weather, state.today)} weight="duotone" />
          {call ? (
            <span
              aria-hidden="true"
              data-call={call.status}
              className={cx("absolute -top-0.5 -right-1 h-3 w-3 rounded-full ring-2 ring-ui-surface", DOT[call.status])}
            />
          ) : null}
        </span>
        {temp ? <span className="font-semibold tabular-nums text-ui-text">{temp}</span> : null}
      </>
    );
  }
  if (state.kind === "loading") {
    return (
      <>
        <CloudSun aria-hidden="true" weight="duotone" className={cx("text-ui-faint", GLYPH)} />
        <span aria-hidden="true" className="block h-4 w-7 rounded-ui-sm bg-ui-surface-2 animate-ui-pulse motion-reduce:animate-none" />
      </>
    );
  }
  if (state.kind === "error") return <CloudSlash aria-hidden="true" weight="duotone" className={cx("text-ui-muted", GLYPH)} />;
  return <CloudSun aria-hidden="true" weight="duotone" className={cx("text-ui-muted", GLYPH)} />;
}

/** The button alone, for any state (the render tests draw each one). */
export function WeatherButtonView({
  state,
  trade,
  open,
  onOpen,
}: {
  state: WeatherState;
  trade: WeatherImpactTrade;
  open: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={weatherButtonLabel(state, trade)}
      data-testid="top-bar-weather"
      data-state={state.kind}
      className={cx(
        "ui-focus-ring inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-1.5 rounded-full border border-ui-line bg-ui-surface px-3 text-ui-base",
        UI_TEXT,
        TAP,
        PRESS,
      )}
    >
      <WeatherFace state={state} trade={trade} />
    </button>
  );
}

/**
 * The weather, top right on every main tab: the condition, the temperature
 * and a dot for your trade's call. A tap slides up "Weather impact".
 *
 * Where it's for: the phone's location when that's already allowed (never
 * asked for here), else the business address; "Use my location" in the
 * sheet is where the phone asks. Kept for the session for 30 minutes, so
 * switching tabs is instant; looked up again when the app comes back after
 * that. Your trade is remembered on this device.
 */
export function WeatherButton() {
  const [state, setState] = useState<WeatherState>({ kind: "loading" });
  const [trade, setTrade] = useState<WeatherImpactTrade>(DEFAULT_TRADE);
  const [open, setOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const shownAt = useRef(0);

  useEffect(() => {
    if (state.kind === "ready") shownAt.current = state.reading.at;
  }, [state]);

  useEffect(() => {
    let live = true;
    const saved = readTrade(storage("localStorage"));
    void resolveWeather(browserDeps()).then((next) => {
      if (!live) return;
      setTrade(saved);
      setState(next);
    });
    // Back in the app after a while: a stale forecast is looked up again.
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - shownAt.current < WEATHER_TTL_MS) return;
      void resolveWeather(browserDeps()).then((next) => {
        if (live) setState(next);
      });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const retry = () => {
    setState({ kind: "loading" });
    void resolveWeather(browserDeps(), { fresh: true }).then(setState);
  };

  const locate = () => {
    setNotice(null);
    setLocating(true);
    void weatherFromPhone(browserDeps()).then((next) => {
      setLocating(false);
      if (next) setState(next);
      else setNotice(NO_FIX_NOTICE);
    });
  };

  const chooseTrade = (next: WeatherImpactTrade) => {
    setTrade(next);
    saveTrade(storage("localStorage"), next);
  };

  return (
    <>
      <WeatherButtonView state={state} trade={trade} open={open} onOpen={() => setOpen(true)} />
      <WeatherSheet
        open={open}
        onClose={() => setOpen(false)}
        state={state}
        trade={trade}
        onTrade={chooseTrade}
        onRetry={retry}
        onEditAddress={() => {
          forgetBase(storage("sessionStorage"));
          setOpen(false);
        }}
        onUseLocation={locate}
        locating={locating}
        notice={notice}
      />
    </>
  );
}
