"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { MapPin } from "@phosphor-icons/react/dist/ssr";
import { cx } from "@/components/ui/cx";
import type { LatLng } from "@/lib/location/geo";
import { fitView, placeOnView, tilesFor } from "@/lib/location/tiles";

export type MapPinTone = "brand" | "info" | "ok";

/** One pin on the map. */
export interface MapPoint extends LatLng {
  key: string;
  /** A name over the pin ("Sione"); leave out for a bare pin. */
  label?: string;
  /** brand: the job or a person (default), info: where you clocked in, ok: where you finished. */
  tone?: MapPinTone;
}

export const PIN_TONE: Readonly<Record<MapPinTone, string>> = {
  brand: "text-ui-brand-text",
  info: "text-ui-info",
  ok: "text-ui-ok",
};

/**
 * A small map without a map library: OpenStreetMap's tiles around a few
 * points, a pin on each, and the OpenStreetMap credit. It fits its box's
 * width and zooms to show every pin (street level for one). Tiles load when
 * it's drawn, so draw it only when it's wanted (an opened sheet, a live clock).
 */
export function StaticSiteMap({
  points,
  height,
  empty,
  label,
  testId,
  className,
}: {
  points: readonly MapPoint[];
  /** px */
  height: number;
  /** What to say when there's nothing to put on the map. */
  empty?: ReactNode;
  /** What the map shows, for screen readers ("Map of the Hemi Walker job"). */
  label?: string;
  testId?: string;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.round(entry.contentRect.width);
      if (next > 0) setWidth(next);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const view = fitView(points, width, height);

  return (
    <div
      ref={box}
      data-testid={testId}
      className={cx("relative w-full overflow-hidden rounded-ui-lg border border-ui-line bg-ui-surface-2", className)}
      style={{ height }}
    >
      {view ? (
        <>
          <div role={label ? "img" : undefined} aria-label={label} className="absolute inset-0">
            {tilesFor(view).map((tile) => (
              // eslint-disable-next-line @next/next/no-img-element -- map tiles from OpenStreetMap, not optimisable
              <img
                key={tile.key}
                src={tile.src}
                alt=""
                width={256}
                height={256}
                draggable={false}
                className="absolute max-w-none select-none"
                style={{ left: tile.left, top: tile.top }}
              />
            ))}
            {points.map((point) => {
              const at = placeOnView(point, view);
              return (
                <span
                  key={point.key}
                  data-pin={point.tone ?? "brand"}
                  className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center"
                  style={{ left: at.left, top: at.top }}
                >
                  {point.label ? (
                    <span className="rounded-full bg-ui-bg px-2 py-0.5 text-ui-xs font-semibold whitespace-nowrap text-ui-text shadow-ui-raised">
                      {point.label}
                    </span>
                  ) : null}
                  <MapPin aria-hidden="true" weight="fill" className={cx("text-[2rem]", PIN_TONE[point.tone ?? "brand"])} />
                </span>
              );
            })}
          </div>
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            className="absolute right-1 bottom-1 rounded bg-ui-bg px-1.5 text-ui-xs text-ui-muted"
          >
            {"\u00A9"} OpenStreetMap contributors
          </a>
        </>
      ) : (
        <p className="flex h-full items-center justify-center px-6 text-center text-ui-sm text-ui-muted">{empty}</p>
      )}
    </div>
  );
}
