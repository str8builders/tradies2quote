"use client";
import { usePathname } from "next/navigation";
export function TradiesOnly({children}:{children:React.ReactNode}) {
  const path=usePathname();
  return path === "/t2qcal" || path.startsWith("/t2qcal/") ? null : children;
}
