import { Header } from "./_components/landing/Header";
import { Hero } from "./_components/landing/Hero";
import { DemoReel } from "./_components/landing/DemoReel";
import { QuoteWorkflow } from "./_components/landing/QuoteWorkflow";
import { HowItWorks } from "./_components/landing/HowItWorks";
import { Features } from "./_components/landing/Features";
import { CompanionApp } from "./_components/landing/CompanionApp";
import { FounderStory } from "./_components/landing/FounderStory";
import { Pricing } from "./_components/landing/Pricing";
import { FAQ } from "./_components/landing/FAQ";
import { FinalCta } from "./_components/landing/FinalCta";
import { Footer } from "./_components/landing/Footer";
import { ScrollProgress } from "./_components/landing/ScrollProgress";
import InstallNudge from "./_components/landing/InstallNudge";
import { Reveal } from "./_components/landing/Reveal";
import { HideInNativeApp } from "./_components/HideInNativeApp";
import { NativeAppRedirect } from "./_components/landing/NativeAppRedirect";
import { isNativeShellRequest } from "@/lib/native-shell";
import { softwareApplicationLd } from "./_components/landing/structured-data";

/** Marketing redesign; native-shell gates remain server-side. */
export default async function HomePage() {
  // 3.1.3(f) — the pricing + FAQ sections carry tier prices, so their HTML
  // must never reach the iOS App Store shell (a client-only hide leaves it
  // in the SSR payload). Server-gated via the shell's UA marker; the
  // <HideInNativeApp> wrapper below stays as defence-in-depth.
  const nativeShell = await isNativeShellRequest();
  return (
    <div className="studio-site min-h-screen text-white relative">
      {/* 3.1.3(f) + 4.2 — the marketing landing never renders inside the
          iOS App Store shell; native visits bounce straight to /app. */}
      <NativeAppRedirect />
      <ScrollProgress />
      <Header hidePricingLinks={nativeShell} />
      <a href="#main-content" className="studio-skip-link">
        Skip to content
      </a>
      <main id="main-content" className="relative z-[2]">
        <Hero />
        <Reveal>
          <HowItWorks />
        </Reveal>
        {/* Remotion walkthrough: capture, draft, review, ready to send. */}
        <Reveal>
          <DemoReel />
        </Reveal>
        <Reveal>
          <QuoteWorkflow />
        </Reveal>
        <Reveal>
          <Features />
        </Reveal>
        {/* 2.5.2 / 3.1.3(f) — the companion calculator is a native iOS app
            that is NOT distributed through the App Store. Advertising it (and
            linking to /calculator, which takes an email for it) inside the iOS
            App Store shell is exactly the kind of off-store distribution route
            review rejects, so the whole section is withheld server-side there,
            the same way Pricing and the FAQ are. The <HideInNativeApp> wrapper
            is defence-in-depth only. */}
        {!nativeShell ? (
          <HideInNativeApp>
            <Reveal>
              <CompanionApp />
            </Reveal>
          </HideInNativeApp>
        ) : null}
        <Reveal>
          <FounderStory />
        </Reveal>
        {/* 3.1.3(f) — no pricing anywhere in the iOS App Store shell.
            The shell launches into /app, but a signed-out user can
            still reach "/" via auth-page links; these sections (tier
            prices + the FAQ's pricing answers) vanish there — withheld
            server-side, with the client hide as belt-and-braces. */}
        {!nativeShell ? (
          <HideInNativeApp>
            <Reveal>
              <Pricing />
            </Reveal>
            <Reveal>
              <FAQ />
            </Reveal>
          </HideInNativeApp>
        ) : null}
        <Reveal>
          <FinalCta />
        </Reveal>
      </main>
      <Footer hidePricingLinks={nativeShell} />
      {/* Wave 19.4 — <LoadingScreen /> removed from the marketing
          landing. The Hero phone mockup is the LCP and shouldn't be
          covered by a 1.7s splash overlay on cold loads. The in-app
          splash stays mounted at src/app/app/layout.tsx for the
          authenticated surface where it makes more sense. */}
      <InstallNudge />

      {!nativeShell && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(softwareApplicationLd),
          }}
        />
      )}
    </div>
  );
}
