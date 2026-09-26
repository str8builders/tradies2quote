import type { Icon, IconProps } from "@phosphor-icons/react";
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun } from "@phosphor-icons/react/dist/ssr";
import type { DayOutlook } from "@/lib/weather-impact/outlook";

export type WeatherCondition = DayOutlook["condition"];

/** The icon for each forecast condition: Home's weather line and the top bar's weather. */
export const CONDITION_ICON: Readonly<Record<WeatherCondition, Icon>> = {
  clear: Sun,
  cloud: Cloud,
  drizzle: CloudRain,
  rain: CloudRain,
  thunderstorm: CloudLightning,
  fog: CloudFog,
  snow: CloudSnow,
  changing: CloudSun,
};

/** A condition's icon, with sun-and-cloud for anything unknown. Decorative: say the words beside it. */
export function WeatherIcon({ condition, ...props }: IconProps & { condition: WeatherCondition | null | undefined }) {
  const Glyph = (condition ? CONDITION_ICON[condition] : undefined) ?? CloudSun;
  return <Glyph aria-hidden="true" {...props} />;
}
