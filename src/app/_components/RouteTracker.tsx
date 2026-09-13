"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordPathname } from "@/lib/route-history";

/** Records each pathname so entry-only UI (the welcome intro) can tell a real entry from a return. Renders nothing. */
export function RouteTracker() {
  const pathname = usePathname();
  useEffect(() => { recordPathname(pathname); }, [pathname]);
  return null;
}
