import Link from "next/link";
import type { Icon } from "@phosphor-icons/react";
import {
  CaretRight,
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Sun,
} from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/components/ui/cx";
import { ICON_CHIP, TAP, UI_TEXT } from "@/components/ui/styles";
import { getWeekOutlook, type DayOutlook } from "@/lib/weather-impact/outlook";
import { pickToday, weatherLine, type WeatherLineModel } from "../lib/weather-line";

const CONDITION_ICON: Readonly<Record<DayOutlook["condition"], Icon>> = {
  clear: Sun,
  cloud: Cloud,
  drizzle: CloudRain,
  rain: CloudRain,
  thunderstorm: CloudLightning,
  fog: CloudFog,
  snow: CloudSnow,
  changing: CloudSun,
};

/** The line itself: condition icon (tinted by the work call), words, and a way in. */
export function WeatherLineView({ line, href }: { line: WeatherLineModel; href: string | null }) {
  const ConditionIcon = CONDITION_ICON[line.condition] ?? CloudSun;
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cx(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-md text-[1.375rem]",
          ICON_CHIP[line.tone],
        )}
      >
        <ConditionIcon weight="bold" />
      </span>
      <span className="min-w-0 flex-1">{line.text}</span>
      {href ? <CaretRight aria-hidden="true" weight="bold" className="shrink-0 text-[1.25rem] text-ui-faint" /> : null}
    </>
  );
  const box = cx(
    "flex min-h-14 items-center gap-3 rounded-ui-lg border border-ui-line bg-ui-surface px-3 py-2 text-ui-base no-underline",
    UI_TEXT,
  );
  return href ? (
    <Link href={href} data-testid="home-weather" className={cx(box, "ui-focus-ring hover:bg-ui-surface-2", TAP)}>
      {content}
    </Link>
  ) : (
    <div data-testid="home-weather" className={box}>
      {content}
    </div>
  );
}

/**
 * Today's weather for the business address, from the dashboard's cached
 * week outlook (no extra forecast calls). Renders nothing when the forecast
 * can't be had — never a broken card.
 */
export async function WeatherLine({
  address,
  todayKey,
  href,
}: {
  address: string;
  todayKey: string | null;
  href: string | null;
}) {
  let day: DayOutlook | null = null;
  let locality = "";
  try {
    const outlook = await getWeekOutlook(address);
    day = outlook ? pickToday(outlook.days, todayKey) : null;
    locality = outlook?.locality ?? "";
  } catch {
    return null;
  }
  if (!day) return null;
  return <WeatherLineView line={weatherLine(day, locality)} href={href} />;
}
