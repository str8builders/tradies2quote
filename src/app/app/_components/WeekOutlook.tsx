import { WeatherAttribution } from "@/components/WeatherAttribution";
import Link from "next/link";
import {
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Cloud,
  Sun,
  ArrowRight,
} from "@phosphor-icons/react/dist/ssr";
import { getWeekOutlook, type DayOutlook } from "@/lib/weather-impact/outlook";

/**
 * Dashboard week-outlook strip — five day chips for the tradie's own
 * base location (profile address), each with a work-suitability dot
 * that mirrors the risk engine's traffic light. Links through to the
 * full /app/weather tool for per-job, per-trade detail.
 *
 * Server component. When the profile has NO address it renders a slim
 * self-diagnosing prompt instead of vanishing — an empty Settings
 * address silently killed the whole weather surface once (user cleared
 * the field, weather + calendar dots disappeared with zero explanation,
 * and it read as a broken app). Upstream failures (geocode/forecast
 * down) still render nothing — never a broken card.
 */

const CONDITION_ICON: Record<DayOutlook["condition"], typeof Sun> = {
  clear: Sun,
  cloud: Cloud,
  drizzle: CloudRain,
  rain: CloudRain,
  thunderstorm: CloudLightning,
  fog: CloudFog,
  snow: CloudSnow,
  changing: CloudSun,
};

const STATUS_DOT: Record<DayOutlook["status"], string> = {
  safe: "bg-emerald-400",
  caution: "bg-amber-400",
  unsafe: "bg-red-400",
};

function dayLabel(dateISO: string, todayISO: string): string {
  if (dateISO === todayISO) return "Today";
  const d = new Date(`${dateISO}T12:00:00`);
  return new Intl.DateTimeFormat("en-NZ", { weekday: "short" }).format(d);
}

export async function WeekOutlook({
  address,
  todayISO,
}: {
  address: string | null;
  todayISO: string;
}) {
  if (!address) {
    return (
      <Link
        href="/app/settings"
        data-testid="week-outlook-needs-address"
        className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 transition-colors hover:border-brand/40"
      >
        <span className="flex items-center gap-2.5 min-w-0">
          <CloudSun size={18} weight="bold" className="shrink-0 text-brand" aria-hidden="true" />
          <span className="truncate text-sm text-ink-300">
            Add your business address in Settings to see site weather here.
          </span>
        </span>
        <ArrowRight size={14} weight="bold" className="shrink-0 text-brand" aria-hidden="true" />
      </Link>
    );
  }
  let outlook;
  try {
    outlook = await getWeekOutlook(address);
  } catch {
    return null;
  }
  if (!outlook) return null;

  return (
    <div className="mt-5" data-testid="week-outlook">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-400">
          {"// Week outlook · "}
          {outlook.locality}
        </p>
        <Link
          href="/app/weather"
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-ink-300 transition-colors hover:text-brand"
        >
          Job weather
          <ArrowRight size={11} weight="bold" aria-hidden="true" />
        </Link>
      </div>
      <div className="mt-2.5 grid grid-cols-5 gap-1.5">
        {outlook.days.map((d) => {
          const Icon = CONDITION_ICON[d.condition] ?? CloudSun;
          return (
            <div
              key={d.date}
              title={`${d.reason}${d.rainProbabilityMaxPct != null ? ` · rain ${Math.round(d.rainProbabilityMaxPct)}%` : ""}`}
              className="flex flex-col items-center gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] px-1 py-2.5"
            >
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-300">
                {dayLabel(d.date, todayISO)}
              </span>
              <Icon size={18} className="text-ink-200" aria-hidden="true" />
              <span className="text-xs font-semibold text-white">
                {d.tempMaxC != null ? `${Math.round(d.tempMaxC)}°` : "—"}
              </span>
              <span className="flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[d.status]}`}
                />
                <span className="sr-only">{d.status}</span>
              </span>
            </div>
          );
        })}
      </div>
      <WeatherAttribution />
    </div>
  );
}
