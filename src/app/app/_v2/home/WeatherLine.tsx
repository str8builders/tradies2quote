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

/**
 * The line itself: condition icon (tinted by the work call), words, and a
 * way in. "chip" is the small pill in the corner of Home's photo hero.
 */
export function WeatherLineView({
  line,
  href,
  variant = "row",
}: {
  line: WeatherLineModel;
  href: string | null;
  variant?: "row" | "chip";
}) {
  const ConditionIcon = CONDITION_ICON[line.condition] ?? CloudSun;
  if (variant === "chip") {
    const chip = cx(
      "inline-flex min-h-9 max-w-full items-center gap-2 rounded-full bg-ui-bg/80 py-1 pr-3 pl-1 text-ui-sm font-semibold text-ui-text no-underline backdrop-blur-sm",
      UI_TEXT,
    );
    const inner = (
      <>
        <span
          aria-hidden="true"
          className={cx("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[1.125rem]", ICON_CHIP[line.tone])}
        >
          <ConditionIcon weight="fill" />
        </span>
        <span className="min-w-0">{line.text}</span>
      </>
    );
    return href ? (
      <Link href={href} data-testid="home-weather" className={cx(chip, "ui-focus-ring", TAP)}>
        {inner}
      </Link>
    ) : (
      <div data-testid="home-weather" className={chip}>
        {inner}
      </div>
    );
  }
  const content = (
    <>
      <span
        aria-hidden="true"
        className={cx(
          "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-ui-md text-[1.375rem]",
          ICON_CHIP[line.tone],
        )}
      >
        <ConditionIcon weight="duotone" />
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
  variant = "row",
}: {
  address: string;
  todayKey: string | null;
  href: string | null;
  variant?: "row" | "chip";
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
  return <WeatherLineView line={weatherLine(day, locality)} href={href} variant={variant} />;
}
