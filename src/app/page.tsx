import { Header } from "./_components/landing/Header";
import { Hero } from "./_components/landing/Hero";
import { Pain } from "./_components/landing/Pain";
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
import { CursorSpotlight } from "./_components/landing/CursorSpotlight";
import TapeDivider from "./_components/landing/TapeDivider";
import InstallNudge from "./_components/landing/InstallNudge";
import { Reveal } from "./_components/landing/Reveal";
import { HideInNativeApp } from "./_components/HideInNativeApp";
import { NativeAppRedirect } from "./_components/landing/NativeAppRedirect";
import { isNativeShellRequest } from "@/lib/native-shell";
import { softwareApplicationLd } from "./_components/landing/structured-data";

/**
 * Wave 10.5 — `<StatStrip />` and `<LiveTicker />` were removed from the
 * landing because they showed invented platform numbers (12,847 quotes,
 * $4.2M invoiced, 1,243 tradies, fake "Riki T. sent quote $3,420"
 * notifications).
 *
 * Wave 19.2 — `<Testimonials />` removed for the same reason: the three
 * quotes ("Riki T. · Builder · Auckland", "Macca · Plumber · Brisbane",
 * "James W. · Sparkie · Manchester") were placeholder copy attributed
 * to non-existent customers. The component is kept on disk so it can
 * be re-mounted once real beta-tradie quotes (with consent) are ready
 * to swap in. The page reads honestly: Hero → Pain → product → pricing
 * → FAQ → CTA, no fabricated social proof.
 */
export default async function HomePage() {
  // 3.1.3(f) — the pricing + FAQ sections carry tier prices, so their HTML
  // must never reach the iOS App Store shell (a client-only hide leaves it
  // in the SSR payload). Server-gated via the shell's UA marker; the
  // <HideInNativeApp> wrapper below stays as defence-in-depth.
  const nativeShell = await isNativeShellRequest();
  return (
    <div className="min-h-screen bg-ink-900 text-white relative">
      {/* 3.1.3(f) + 4.2 — the marketing landing never renders inside the
          iOS App Store shell; native visits bounce straight to /app. */}
      <NativeAppRedirect />
      <CursorSpotlight />
      <ScrollProgress />
      <Header hidePricingLinks={nativeShell} />
      <main className="relative z-[2]">
        <Hero />
        {/* Scroll-reveal motion on every below-the-fold section (Reveal.tsx).
            Hero stays unwrapped — it's the LCP and must paint instantly. */}
        <Reveal>
          <Pain />
        </Reveal>
        {/* Remotion-powered 15s product reel (voice → quote → paid).
            Sits right after Pain so the fix plays immediately after
            the problem; the deeper AppShowcase tour follows below. */}
        <Reveal>
          <DemoReel />
        </Reveal>
        <Reveal>
          <QuoteWorkflow />
        </Reveal>
        <Reveal>
          <HowItWorks />
        </Reveal>
        <TapeDivider label="ONE TOOL · DOES ONE THING · DOES IT WELL" />
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

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareApplicationLd),
        }}
      />
    </div>
  );
}
