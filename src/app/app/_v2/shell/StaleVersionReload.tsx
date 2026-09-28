"use client";

import { useEffect } from "react";
import { isOutOfDate } from "@/lib/stale-deploy";
import { hasUnsavedInput } from "@/lib/unsaved-input";

/** Away at least this long before checking: a quick app switch doesn't need it. */
export const AWAY_MS = 30_000;

/**
 * Load the live version only when this page is out of date and nothing on
 * screen would be lost. A page holding unsaved input (the words for a new
 * quote, an open editor) keeps it: its next save meets the update and
 * reloads then, with the new-quote words backed up for it.
 */
export function shouldReloadForUpdate(build: string | null, liveCommit: unknown, unsavedInput: boolean): boolean {
  return !unsavedInput && isOutOfDate(build, liveCommit);
}

/** The browser pieces the watcher uses (the real document and window fit). */
export interface UpdateWatchEnv {
  document: {
    readonly visibilityState: string;
    addEventListener(type: "visibilitychange", listener: () => void): void;
    removeEventListener(type: "visibilitychange", listener: () => void): void;
  };
  fetch: (url: string, init: RequestInit) => Promise<{ ok: boolean; json(): Promise<unknown> }>;
  reload: () => void;
  now: () => number;
  unsavedInput: () => boolean;
}

/**
 * Watch for coming back to the page after AWAY_MS or more, ask which version
 * is live (/api/health) and reload when this one is older and holds nothing
 * unsaved. Returns the cleanup.
 */
export function watchForUpdate(build: string | null, env: UpdateWatchEnv): () => void {
  if (!build) return () => {};
  const { document: doc } = env;
  let hiddenAt = doc.visibilityState === "hidden" ? env.now() : 0;
  const onChange = () => {
    if (doc.visibilityState === "hidden") {
      hiddenAt = env.now();
      return;
    }
    const away = hiddenAt ? env.now() - hiddenAt : 0;
    hiddenAt = 0;
    if (away < AWAY_MS) return;
    void env
      .fetch("/api/health", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((health) => {
        const commit = health && typeof health === "object" ? (health as { commit?: unknown }).commit : undefined;
        if (health && shouldReloadForUpdate(build, commit, env.unsavedInput())) env.reload();
      })
      .catch(() => {});
  };
  doc.addEventListener("visibilitychange", onChange);
  return () => doc.removeEventListener("visibilitychange", onChange);
}

/**
 * A page left open across an update (the iPhone app keeps it open for days)
 * would call the old version's actions and fail. When you come back to it,
 * this asks which version is live and, if it's newer than the one this page
 * came from, loads it. Nothing happens while you're using it, or while the
 * page holds something you haven't saved (lib/unsaved-input).
 */
export function StaleVersionReload({ build }: { build: string | null }) {
  useEffect(
    () =>
      watchForUpdate(build, {
        document,
        fetch: (url, init) => fetch(url, init),
        reload: () => window.location.reload(),
        now: () => Date.now(),
        unsavedInput: hasUnsavedInput,
      }),
    [build],
  );
  return null;
}
