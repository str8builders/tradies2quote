import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { isNativeShellRequest } from "@/lib/native-shell";
import { AppNavigation } from "@/t2qcal/components/AppNavigation";
import { NativeShell } from "@/t2qcal/components/NativeShell";
import "./t2qcal.css";
import {BackupSyncProvider} from "@/t2qcal/components/BackupSync";

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
/**
 * The web T2QCAL is for people browsing the website. Inside the Tradies2Quote
 * iOS app it never opens: T2QCAL is its own app, and every T2QCAL button in
 * Tradies2Quote launches that (t2qcal://). A stray link lands back in the app.
 */
export default async function CalculatorLayout({ children }: { children: React.ReactNode }) {
  if (await isNativeShellRequest()) redirect("/app");
  return <div className="t2qcal-app"><BackupSyncProvider>
    <NativeShell/>
    {children}
    <AppNavigation/>

  </BackupSyncProvider></div>;
}
