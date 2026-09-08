import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { WebAppControls } from "@/t2qcal/components/WebAppControls";
import "./t2qcal.css";

export const metadata: Metadata = {
  title: { absolute: "T2QCAL — Construction calculators" },
  description: "Construction calculators with live diagrams, saved working and material quantities for Tradies2Quote.",
  manifest: "/t2qcal/manifest.webmanifest",
  appleWebApp: { capable: true, title: "T2QCAL", statusBarStyle: "default" },
  icons: { icon: "/t2qcal/icon-192.png", apple: "/t2qcal/apple-touch-icon.png" },
  openGraph: { title: "T2QCAL — Construction calculators", images: [] },
  twitter: { title: "T2QCAL — Construction calculators", images: [] },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 5, userScalable: true, themeColor: "#0a0a0a", viewportFit: "cover" };
export default function CalculatorLayout({ children }: { children: React.ReactNode }) {
  return <div className="t2qcal-app">
    <header className="site-header"><div className="header-inner">
      <Link className="brand" href="/t2qcal" aria-label="T2QCAL home"><span className="brand-mark" aria-hidden="true"><i/><i/><i/></span><span>T2Q</span><b>CAL</b></Link>
      <nav className="primary-nav" aria-label="T2QCAL navigation"><Link href="/t2qcal/calculators">Calculators</Link><Link href="/t2qcal/saved">Saved working</Link><a href="/app">Tradies2Quote</a></nav>
    </div></header>
    <WebAppControls/>
    {children}
    <footer className="site-footer"><div><div className="footer-brand">T2Q <span>CAL</span></div><p>Your measurements. Your working.</p></div><div className="footer-links"><a href="/app">Open Tradies2Quote</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div></footer>
  </div>;
}
