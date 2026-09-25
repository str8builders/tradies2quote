import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { isNativeShellRequest } from "@/lib/native-shell";
import { JobSiteStory } from "../_components/jobsite/JobSiteStory";

// The 3D job-site website, built in stages for the owner to try on a phone
// before it replaces the homepage. Hidden: not indexed and not linked.
export const metadata: Metadata = {
  title: "Site preview",
  robots: { index: false, follow: false, nocache: true },
};

// Same as the homepage: visitors can pinch-zoom.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  viewportFit: "cover",
  themeColor: "#0A0A0A",
};

export default async function SitePreviewPage() {
  // 3.1.3(f): marketing and pricing never show inside the iOS App Store shell.
  if (await isNativeShellRequest()) redirect("/");
  return <JobSiteStory nativeShell={false} />;
}
