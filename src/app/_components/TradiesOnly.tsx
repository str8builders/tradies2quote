"use client";
import { usePathname } from "next/navigation";
export function TradiesOnly({children}:{children:React.ReactNode}) {
  const path=usePathname();
  // T2QCAL has its own look; the 3D site preview draws its own world.
  return path === "/t2qcal" || path.startsWith("/t2qcal/") || path === "/site-preview" ? null : children;
}
