import type { Metadata, Viewport } from "next";
import { AppNavigation } from "@/t2qcal/components/AppNavigation";
import { NativeShell } from "@/t2qcal/components/NativeShell";
import "./t2qcal.css";

export const metadata: Metadata = {
  title: { absolute: "T2QCAL — Construction calculators" },
  description: "Construction calculators with live diagrams, saved working and material quantities for Tradies2Quote.",
  manifest: "/t2qcal/manifest.webmanifest",
  appleWebApp: { capable: true, title: "T2QCAL", statusBarStyle: "default" },
  icons: { icon: "/t2qcal/native-icon.png", apple: "/t2qcal/native-icon.png" },
  openGraph: { title: "T2QCAL — Construction calculators", images: [] },
  twitter: { title: "T2QCAL — Construction calculators", images: [] },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true, themeColor: "#0a0a0a", viewportFit: "cover" };
export default function CalculatorLayout({ children }: { children: React.ReactNode }) {
  return <div className="t2qcal-app">
    <NativeShell/>
    {children}
    <AppNavigation/>

  </div>;
}
