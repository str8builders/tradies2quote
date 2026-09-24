"use client";

import { usePathname } from "next/navigation";
import { TopBar } from "@/components/ui/top-bar";
import { legacyTopBar } from "../lib/app-nav";

/**
 * What <AppHeader> renders in the new look, on pages not yet redesigned:
 * a plain title and a way back (the bottom bar or side rail does the rest),
 * so there is never a second navigation. The /app shell pads the notch.
 */
export function LegacyTopBar({ context }: { context?: string }) {
  const bar = legacyTopBar(usePathname(), context);
  return <TopBar title={bar.title} subtitle={bar.subtitle} back={bar.back} safeArea={false} />;
}
