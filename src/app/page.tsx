import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { isNativeShellRequest } from "@/lib/native-shell";
import { JobSiteStory } from "./_components/jobsite/JobSiteStory";
import { NativeAppRedirect } from "./_components/landing/NativeAppRedirect";

// The public home page lets visitors pinch-zoom. The root layout locks zoom
// for the installed app shell (see the mobile shell contract); the home page
// never renders inside that shell, and T2QCAL already overrides the lock the
// same way. Other fields mirror the root viewport.
export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#0A0A0A",
};

/**
 * The marketing home page: the 3D job-site website, one job followed from
 * first light to tools down (src/app/_components/jobsite). It was built at
 * /site-preview and replaced the previous homepage on 27 Sep 2026; that one
 * is kept at /classic (not indexed) and tagged website-classic-2026-09-27.
 */
export default async function HomePage() {
  // 3.1.3(f) + 4.2: the page carries trial wording, tier prices and the
  // T2QCAL link, so the iOS App Store shell never gets its HTML: straight to
  // the app, as before. <NativeAppRedirect> stays for older shells.
  if (await isNativeShellRequest()) redirect("/app");
  return (
    <>
      <NativeAppRedirect />
      <JobSiteStory nativeShell={false} />
    </>
  );
}
