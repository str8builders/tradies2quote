"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Crosshair, WarningCircle } from "@phosphor-icons/react";
import type { HereWeather } from "@/app/api/weather/here/route";

const KEY = "t2q-weather-here";
const STATUS: Record<string, { dot: string; text: string; label: string }> = {
  safe: { dot: "bg-emerald-400", text: "text-emerald-300", label: "Safe" },
  caution: { dot: "bg-amber-400", text: "text-amber-300", label: "Caution" },
  unsafe: { dot: "bg-red-400", text: "text-red-300", label: "Unsafe" },
};

function dayLabel(dateISO: string, todayISO: string) {
  if (dateISO === todayISO) return "Today";
  return new Intl.DateTimeFormat("en-NZ", { weekday: "short" }).format(new Date(`${dateISO}T12:00:00`));
}

/**
 * Weather where the tradie actually is, with a call for every trade — not
 * just the base address. Asks for location only on a tap; remembers the
 * choice on this device so it just shows next time.
 */
export function LocalWeather({ todayISO }: { todayISO: string }) {
  const [data, setData] = useState<HereWeather | null>(null);
  const [state, setState] = useState<"idle" | "locating" | "loading" | "ready" | "denied" | "error">("idle");
  const [message, setMessage] = useState("");
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
        if (err.code === err.PERMISSION_DENIED) { setState("denied"); setMessage("Location is off for this site. Allow it in your browser settings, or keep using the forecast for your business address above."); try { localStorage.removeItem(KEY); } catch { /* optional */ } }
        else { setState("error"); setMessage("Couldn't get a fix on your location. Try again outside or with Wi-Fi on."); }
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 10 * 60 * 1000 },
    );
  }, []);
  // Remembered on this device: refresh silently on each visit.
  useEffect(() => {
    let remembered = false;
    try { remembered = localStorage.getItem(KEY) === "1"; } catch { /* optional */ }
    if (!remembered) return;
    const timer = window.setTimeout(locate, 0);
    return () => window.clearTimeout(timer);
  }, [locate]);

  return <section data-testid="dashboard-local-weather" aria-label="Weather where you are" className="t2q-card-pro mt-4 p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">{"// weather impact · where you are"}</div>
        <p className="mt-1 text-sm text-ink-300">{data ? `${data.current.summary ?? "Now"}${data.current.temperatureC != null ? ` · ${Math.round(data.current.temperatureC)}°` : ""}${data.current.windGustKph != null ? ` · gusts ${Math.round(data.current.windGustKph)} kph` : ""}${data.current.rainProbabilityPct != null ? ` · rain ${Math.round(data.current.rainProbabilityPct)}%` : ""}` : "Forecast and a safe / caution / unsafe call for every trade, from the phone's location."}</p>
      </div>
      <button type="button" onClick={locate} disabled={state === "locating" || state === "loading"} className="t2q-btn-ghost-pro inline-flex h-9 px-3 text-xs disabled:opacity-60" data-testid="local-weather-locate">
        <Crosshair size={14} weight="bold" />{state === "locating" ? "Locating…" : state === "loading" ? "Loading…" : data ? "Update location" : "Use my location"}
      </button>
    </div>
    {message ? <p role="status" className="mt-3 flex items-start gap-2 text-xs text-hivis"><WarningCircle size={14} weight="bold" className="mt-0.5 shrink-0" />{message}</p> : null}
    {data ? <>
      <ul className="mt-4 flex gap-2 overflow-x-auto" aria-label="Five-day outlook">
        {data.days.map((d) => <li key={d.date} className="flex min-w-[76px] flex-col items-center rounded-md border border-ink-700 bg-ink-900/70 px-2 py-2 text-center">
          <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-ink-400">{dayLabel(d.date, todayISO)}</span>
          <span className="mt-1 text-sm font-semibold text-white">{d.tempMaxC != null ? `${Math.round(d.tempMaxC)}°` : "—"}</span>
          <span className={`mt-1 inline-block h-2 w-2 rounded-full ${STATUS[d.status].dot}`} aria-label={STATUS[d.status].label} />
          <span className="mt-1 text-[10px] leading-tight text-ink-400">{d.reason}</span>
        </li>)}
      </ul>
      <ul className="mt-4 grid gap-2 sm:grid-cols-3" aria-label="Impact by trade today" data-testid="local-weather-trades">
        {data.trades.map((t) => <li key={t.id} className="flex items-start gap-2 rounded-md border border-ink-700 bg-ink-900/70 px-3 py-2">
          <span className={`mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full ${STATUS[t.status].dot}`} aria-hidden="true" />
          <span className="min-w-0"><span className="block text-sm font-semibold text-white">{t.label} <span className={`font-mono text-[10px] uppercase tracking-[0.15em] ${STATUS[t.status].text}`}>{STATUS[t.status].label}</span></span><span className="block text-xs text-ink-400">{t.reason}</span></span>
        </li>)}
      </ul>
      <Link href="/app/weather" className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-ink-300 hover:text-brand">Per-job detail <ArrowRight size={12} weight="bold" /></Link>
    </> : null}
  </section>;
}
