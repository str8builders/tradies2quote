"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import {
  TEXT_SIZES,
  TEXT_SIZE_CHANGE_EVENT,
  TEXT_SIZE_LABELS,
  readTextSize,
  setTextSize,
  type TextSize,
} from "@/lib/ui/text-size";
import { SegmentedControl } from "./segmented-control";

function subscribe(onChange: () => void): () => void {
  window.addEventListener(TEXT_SIZE_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(TEXT_SIZE_CHANGE_EVENT, onChange);
}

const OPTIONS = TEXT_SIZES.map((value) => ({ value, label: TEXT_SIZE_LABELS[value] }));

export interface TextSizeControlProps {
  /** The size the server rendered with (from the t2q-text cookie). */
  initial: TextSize;
  label?: ReactNode;
  className?: string;
}

/**
 * Text size for this device: Normal, Large or Extra large. Saves the t2q-text
 * cookie and resizes the page straight away by flipping data-text on every
 * [data-contrast-root]. The size is read from the page itself, so any number
 * of these controls always agree.
 */
export function TextSizeControl({ initial, label = "Text size", className }: TextSizeControlProps) {
  const size = useSyncExternalStore(
    subscribe,
    () => readTextSize(document),
    () => initial,
  );
  return <SegmentedControl label={label} options={OPTIONS} value={size} onChange={setTextSize} className={className} />;
}
