/**
 * The one-line weather on the new-look Home, from the dashboard's existing
 * week outlook (same cached forecast, same safe / caution / unsafe call as
 * the risk engine). Pure.
 */

import type { DayOutlook } from "@/lib/weather-impact/outlook";

export type WeatherTone = "ok" | "warn" | "bad";

export interface WeatherLineModel {
  text: string;
  tone: WeatherTone;
  condition: DayOutlook["condition"];
}

/** Today's forecast (the site's calendar day), else the first day given. */
export function pickToday(days: readonly DayOutlook[], todayKey: string | null): DayOutlook | null {
  return days.find((d) => d.date === todayKey) ?? days[0] ?? null;
}

function lowerFirst(text: string): string {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/** "Tauranga today: take care, gusts 38 kph · 17°". */
export function weatherLine(day: DayOutlook, locality: string): WeatherLineModel {
  const place = locality.trim() ? `${locality.trim()} today` : "Today";
  const temp = day.tempMaxC == null || !Number.isFinite(day.tempMaxC) ? "" : ` · ${Math.round(day.tempMaxC)}°`;
  switch (day.status) {
    case "unsafe":
      return { text: `${place}: not safe outside, ${lowerFirst(day.reason)}${temp}`, tone: "bad", condition: day.condition };
    case "caution":
      return { text: `${place}: take care, ${lowerFirst(day.reason)}${temp}`, tone: "warn", condition: day.condition };
    default:
      return { text: `${place}: good to work${temp}`, tone: "ok", condition: day.condition };
  }
}
