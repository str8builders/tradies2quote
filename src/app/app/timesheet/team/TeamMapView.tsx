"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowSquareOut, MapPin, UserCircle } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { fitView, mapsLink, placeOnView, tilesFor } from "@/lib/location/tiles";
import type { TeamMember } from "../_lib/team-map";

const REFRESH_MS = 60_000;
const MAP_HEIGHT = 300;

/** "3 min ago", "just now". */
export function ago(iso: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const h = Math.floor(minutes / 60);
  return `${h} h ${minutes % 60} min ago`;
}

/**
 * The owner's live team map: everyone clocked in, where they were last seen,
 * refreshed every minute while the page is open. OpenStreetMap tiles; tap a
 * person to open the spot in Maps.
 */
export function TeamMapView({ members }: { members: TeamMember[] }) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(360);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      router.refresh();
    };
    const timer = window.setInterval(tick, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  const placed = members.filter((m) => m.at);
  const view = fitView(placed.map((m) => m.at!), width, MAP_HEIGHT);

  if (members.length === 0) {
    return (
      <EmptyState icon={<MapPin weight="duotone" />} title="Nobody's clocked in">
        When your team starts work, they show here: where they are, and since when.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div
        ref={box}
        data-testid="team-map"
        className="relative w-full overflow-hidden rounded-ui-lg border border-ui-line bg-ui-surface-2"
        style={{ height: MAP_HEIGHT }}
      >
        {view ? (
          <>
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
            {placed.map((m) => {
              const at = placeOnView(m.at!, view);
              return (
                <span
                  key={m.userId}
                  className="absolute flex -translate-x-1/2 -translate-y-full flex-col items-center"
                  style={{ left: at.left, top: at.top }}
                >
                  <span className="rounded-full bg-ui-bg px-2 py-0.5 text-ui-xs font-semibold whitespace-nowrap text-ui-text shadow-ui-raised">
                    {m.name}
                  </span>
                  <MapPin aria-hidden="true" weight="fill" className="text-[2rem] text-ui-brand-text" />
                </span>
              );
            })}
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
          <p className="flex h-full items-center justify-center px-6 text-center text-ui-sm text-ui-muted">
            No locations yet. People show on the map once they&apos;ve turned location on.
          </p>
        )}
      </div>

      <Card padding="none">
        <ul className="divide-y divide-ui-line">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 px-4 py-3 text-ui-base">
              <UserCircle aria-hidden="true" weight="duotone" className="shrink-0 text-[2rem] text-ui-violet" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ui-text">{m.name}</span>
                <span className="block text-ui-sm text-ui-muted" suppressHydrationWarning>
                  {m.at ? `${m.at.place} · ${ago(m.at.time, now)}` : "Location off"}
                </span>
              </span>
              {m.at ? (
                <a
                  href={mapsLink(m.at, m.name)}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={`Open where ${m.name} is in Maps`}
                  className={cx("ui-focus-ring inline-flex h-12 w-12 items-center justify-center rounded-ui-md text-[1.25rem] text-ui-brand-text")}
                >
                  <ArrowSquareOut aria-hidden="true" weight="bold" />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
