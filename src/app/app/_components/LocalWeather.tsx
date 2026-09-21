"use client";
import { WeatherAttribution } from "@/components/WeatherAttribution";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CaretDown, Crosshair, WarningCircle } from "@phosphor-icons/react";
import type { HereWeather } from "@/app/api/weather/here/route";

const KEY = "t2q-weather-here";
const TRADE_KEY = "t2q-weather-trade";
const STATUS: Record<string, { dot: string; text: string; ring: string; label: string }> = {
  safe: { dot: "bg-emerald-400", text: "text-emerald-300", ring: "border-emerald-400/40", label: "Safe" },
  caution: { dot: "bg-amber-400", text: "text-amber-300", ring: "border-amber-400/40", label: "Caution" },
  unsafe: { dot: "bg-red-400", text: "text-red-300", ring: "border-red-400/40", label: "Unsafe" },
};

function dayLabel(dateISO: string, todayISO: string) {
  if (dateISO === todayISO) return "Today";
  return new Intl.DateTimeFormat("en-NZ", { weekday: "short" }).format(new Date(`${dateISO}T12:00:00`));
}

/**
 * Compact weather impact for where the tradie is: pick the trade, read the
 * call. Location is asked for on a tap and remembered on this device; the
 * trade choice is remembered too.
 */
export function LocalWeather({ todayISO }: { todayISO: string }) {
  const [data, setData] = useState<HereWeather | null>(null);
  const [state, setState] = useState<"idle" | "locating" | "loading" | "ready" | "denied" | "error">("idle");
  const [message, setMessage] = useState("");
  const [trade, setTrade] = useState("general_outdoor");
  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) { setState("error"); setMessage("This device cannot share its location."); return; }
    setState("locating"); setMessage("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        setState("loading");
        try {
          const res = await fetch(`/api/weather/here?lat=${pos.coords.latitude.toFixed(3)}&lng=${pos.coords.longitude.toFixed(3)}`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
          const body = (await res.json()) as HereWeather & { error?: string };
          if (!res.ok) throw new Error(body.error || "Forecast unavailable.");
          setData(body); setState("ready");
          try { localStorage.setItem(KEY, "1"); } catch { /* optional */ }
        } catch (e) { setState("error"); setMessage(e instanceof Error ? e.message : "Forecast unavailable."); }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) { setState("denied"); setMessage("Location is off for this site. Allow it in your browser settings, or use the forecast for your business address above."); try { localStorage.removeItem(KEY); } catch { /* optional */ } }
        else { setState("error"); setMessage("Couldn't get a fix on your location. Try again outside or with Wi-Fi on."); }
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 },
    );
  }, []);
  useEffect(() => {
    let remembered = false, savedTrade = "";
    try { remembered = localStorage.getItem(KEY) === "1"; savedTrade = localStorage.getItem(TRADE_KEY) ?? ""; } catch { /* optional */ }
    const timer = window.setTimeout(() => { if (savedTrade) setTrade(savedTrade); if (remembered) locate(); }, 0);
    return () => window.clearTimeout(timer);
  }, [locate]);
  const pick = data?.trades.find((t) => t.id === trade) ?? data?.trades[0] ?? null;
  const busy = state === "locating" || state === "loading";

  return <section data-testid="dashboard-local-weather" aria-label="Weather impact where you are" className="t2q-card-pro mt-4 p-4">
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">{"// weather impact · where you are"}</div>
        {data ? <p className="mt-1 truncate text-xs text-ink-400">{data.current.summary ?? "Now"}{data.current.temperatureC != null ? ` · ${Math.round(data.current.temperatureC)}°` : ""}{data.current.windGustKph != null ? ` · gusts ${Math.round(data.current.windGustKph)} kph` : ""}{data.current.rainProbabilityPct != null ? ` · rain ${Math.round(data.current.rainProbabilityPct)}%` : ""}</p>
        : <p className="mt-1 text-xs text-ink-400">Pick your trade, share your location, get the call for today.</p>}
      </div>
      {data ? <label className="relative">
        <span className="sr-only">Trade</span>
        <select value={pick?.id ?? trade} onChange={(e) => { setTrade(e.target.value); try { localStorage.setItem(TRADE_KEY, e.target.value); } catch { /* optional */ } }} className="h-9 appearance-none rounded-md border border-ink-600 bg-ink-900 pl-3 pr-8 text-sm text-white outline-none focus:border-brand" data-testid="local-weather-trade">
          {data.trades.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
        <CaretDown size={12} weight="bold" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400" aria-hidden="true" />
      </label> : null}
      <button type="button" onClick={locate} disabled={busy} className={`inline-flex h-9 items-center gap-1.5 rounded-md border border-ink-600 px-3 text-xs text-ink-200 hover:border-brand hover:text-brand disabled:opacity-60 ${data ? "" : "t2q-btn-primary-pro !h-9 !px-3"}`} data-testid="local-weather-locate" aria-label={data ? "Update location" : "Use my location"}>
        <Crosshair size={14} weight="bold" />{busy ? "Locating…" : data ? "Update" : "Use my location"}
      </button>
    </div>
    {message ? <p role="status" className="mt-3 flex items-start gap-2 text-xs text-hivis"><WarningCircle size={14} weight="bold" className="mt-0.5 shrink-0" />{message}</p> : null}
    {data && pick ? <>
      <div className={`mt-3 flex items-center gap-3 rounded-md border ${STATUS[pick.status].ring} bg-ink-900/70 px-3 py-2.5`} data-testid="local-weather-call">
        <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${STATUS[pick.status].dot}`} aria-hidden="true" />
        <span className="min-w-0 flex-1"><span className={`font-mono text-[11px] uppercase tracking-[0.2em] ${STATUS[pick.status].text}`}>{STATUS[pick.status].label} today</span><span className="block truncate text-sm text-ink-200">{pick.reason}</span></span>
      </div>
      <ul className="mt-3 flex gap-1.5 overflow-x-auto" aria-label="Five-day outlook">
        {data.days.map((d) => <li key={d.date} className="flex min-w-[60px] flex-1 flex-col items-center rounded-md border border-ink-700 bg-ink-900/60 px-1.5 py-1.5 text-center">
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-400">{dayLabel(d.date, todayISO)}</span>
          <span className="mt-0.5 text-sm font-semibold text-white">{d.tempMaxC != null ? `${Math.round(d.tempMaxC)}°` : "—"}</span>
          <span className={`mt-1 inline-block h-1.5 w-1.5 rounded-full ${STATUS[d.status].dot}`} aria-label={STATUS[d.status].label} />
        </li>)}
      </ul>
      <Link href="/app/weather" className="mt-2 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-400 hover:text-brand">Per-job detail <ArrowRight size={12} weight="bold" /></Link>
      <WeatherAttribution />
    </> : null}
  </section>;
}
