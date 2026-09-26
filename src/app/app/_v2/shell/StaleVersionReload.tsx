"use client";

import { useEffect } from "react";
import { isOutOfDate } from "@/lib/stale-deploy";

/** Away at least this long before checking: a quick app switch doesn't need it. */
const AWAY_MS = 30_000;

/**
 * A page left open across an update (the iPhone app keeps it open for days)
 * would call the old version's actions and fail. When you come back to it,
 * this asks which version is live (/api/health) and, if it's newer than the
 * one this page came from, loads it. Nothing happens while you're using it.
 */
export function StaleVersionReload({ build }: { build: string | null }) {
  useEffect(() => {
    if (!build) return;
    let hiddenAt = document.visibilityState === "hidden" ? Date.now() : 0;
    const onChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = 0;
      if (away < AWAY_MS) return;
      void fetch("/api/health", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((health: { commit?: unknown } | null) => {
          if (health && isOutOfDate(build, health.commit)) window.location.reload();
        })
        .catch(() => {});
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [build]);
  return null;
}
