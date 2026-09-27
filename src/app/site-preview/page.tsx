import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

// The 3D job-site website was built here and is now the homepage (27 Sep
// 2026). Shared preview links (and their #sections) land on it.
export const metadata: Metadata = {
  title: "Tradies2Quote",
  robots: { index: false, follow: false, nocache: true },
};

export default function SitePreviewPage() {
  permanentRedirect("/");
}
