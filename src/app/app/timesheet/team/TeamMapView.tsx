"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowSquareOut, MapPin, UserCircle } from "@phosphor-icons/react/dist/ssr";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/ui/empty-state";
import { mapsLink } from "@/lib/location/tiles";
import { StaticSiteMap } from "../../_v2/ui/StaticSiteMap";
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
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      router.refresh();
    };
    const timer = window.setInterval(tick, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [router]);

  const pins = members.flatMap((m) => (m.at ? [{ key: m.userId, lat: m.at.lat, lng: m.at.lng, label: m.name }] : []));

  if (members.length === 0) {
    return (
      <EmptyState icon={<MapPin weight="duotone" />} title="Nobody's clocked in">
        When your team starts work, they show here: where they are, and since when.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <StaticSiteMap
        points={pins}
        height={MAP_HEIGHT}
        testId="team-map"
        empty="No locations yet. People show on the map once they've turned location on."
      />

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
