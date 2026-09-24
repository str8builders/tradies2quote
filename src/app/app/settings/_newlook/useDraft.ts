"use client";

import { useCallback, useState } from "react";
import { changedKeys, type Draft } from "./model";

export interface DraftApi<T extends Draft> {
  values: T;
  set: <K extends keyof T>(key: K, value: T[K]) => void;
  /** Keys that differ from the last saved values (trimmed text). */
  changed: Array<keyof T & string>;
  dirty: boolean;
  /** Mark these values as saved (the snapshot that was sent, not later typing). */
  commit: (saved: T) => void;
}

/**
 * Values a page is editing plus the last saved copy. The saved copy starts
 * as what the server loaded and moves on each successful Save, so the Save
 * bar only shows while something is really different.
 */
export function useDraft<T extends Draft>(initial: T, keys?: readonly (keyof T & string)[]): DraftApi<T> {
  const [saved, setSaved] = useState<T>(initial);
  const [values, setValues] = useState<T>(initial);
  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValues((previous) => ({ ...previous, [key]: value }));
  }, []);
  const commit = useCallback((snapshot: T) => setSaved(snapshot), []);
  const changed = changedKeys(saved, values, keys);
  return { values, set, changed, dirty: changed.length > 0, commit };
}
