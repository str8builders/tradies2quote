"use client";
import { usePathname } from "next/navigation";
export function TradiesOnly({children}:{children:React.ReactNode}) {
  const path=usePathname();
  // T2QCAL has its own look; the 3D homepage draws its own world (the
  // previous homepage, at /classic, keeps the wallpaper).
  return path === "/" || path === "/t2qcal" || path.startsWith("/t2qcal/") || path === "/site-preview" ? null : children;
}
