import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { Footer } from "../_components/landing/Footer";
import { isNativeShellRequest } from "@/lib/native-shell";
import { InstallGuide } from "./_components/InstallGuide";

export const metadata: Metadata = {
  title: "Install the App",
  description:
    "Add Tradies2Quote to your phone's home screen in a few taps. Step-by-step install guide for iPhone (Safari) and Android (Chrome) — opens fullscreen, no download.",
  alternates: { canonical: "/install" },
  openGraph: {
    title: "Install Tradies2Quote on your phone",
    description:
      "A few taps to put voice-first quoting on your home screen. iPhone + Android guide.",
    url: "/install",
  },
};

/**
 * `/install` — the canonical, shareable install tutorial.
 *
 * A standalone branded page (linkable from texts, emails, social bios, a QR
 * code on the van) that walks a visitor through adding the PWA to their home
 * screen. The smart, platform-aware behaviour lives in <InstallGuide>; this
 * server shell handles SEO metadata, the brand lockup, and the footer.
 */
export default async function InstallPage() {
  const nativeShell = await isNativeShellRequest();
  // Inside the iPhone app this page has nothing to offer (it IS the app) and
  // walks through Android and add-to-Home-Screen steps (App Store 2.3.10):
  // withheld on the server, the same way /calculator is.
  if (nativeShell) redirect("/app");
  return (
    <div className="studio-public studio-install-page min-h-screen text-white">
      {/* Slim brand bar */}
      <header className="border-b border-ink-600">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-5 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="inline-flex rounded-md bg-[#0A0A0A] p-1">
              <Image
                src="/logo-mark.png"
                alt="Tradies2Quote"
                width={32}
                height={32}
                className="rounded-sm"
              />
            </span>
            <span className="font-display text-sm uppercase tracking-tight">
              tradies<span className="text-brand">2</span>quote
            </span>
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300 hover:text-brand"
          >
            <ArrowLeft size={13} weight="bold" />
            Back to site
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-10 sm:py-14">
        {/* Hero */}
        <div className="mb-9 flex flex-col items-center text-center">
          <span className="t2q-shadow-brutal mb-5 grid h-20 w-20 place-items-center rounded-2xl bg-[#0A0A0A]">
            <Image
              src="/logo-mark.png"
              alt=""
              width={56}
              height={56}
              className="rounded-xl"
            />
          </span>
          <div className="t2q-section-label mb-3">{"// add to home screen"}</div>
          <h1 className="font-display text-3xl uppercase leading-[1.05] tracking-tight sm:text-4xl">
            Put quoting on your{" "}
            <span className="text-brand">home screen.</span>
          </h1>
          <p className="mt-3 max-w-md text-ink-300">
            No app store, no download wait. A few taps and Tradies2Quote opens
            like a real app — fullscreen, right there on your home screen.
          </p>
        </div>

        <InstallGuide />

        <p className="mt-8 border border-ink-700 bg-ink-950 p-4 text-center text-sm text-ink-300">
          Want the construction calculators too?{" "}
          <Link href="/t2qcal/install" className="text-brand hover:underline">
            Install T2QCAL as its own app
          </Link>
          . Two icons, one account.
        </p>

        <p className="mt-8 text-center text-sm text-ink-400">
          Stuck? Email{" "}
          <a
            href="mailto:support@tradies2quote.com"
            className="text-brand hover:underline"
          >
            support@tradies2quote.com
          </a>{" "}
          and we&apos;ll walk you through it.
        </p>
      </main>

      <Footer hidePricingLinks={nativeShell} />
    </div>
  );
}
