import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { Footer } from "../_components/landing/Footer";
import { isNativeShellRequest } from "@/lib/native-shell";
import { Logo } from "../_components/landing/Logo";
import { SectionTabs } from "./_components/SectionTabs";

/**
 * Layout for /privacy, /terms, /support.
 *
 * Slim sticky header (logo + "Back to site") + section tabs + the
 * landing footer underneath. Same brand, no marketing nav anchors —
 * those would break from a non-landing URL.
 */
export default async function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nativeShell = await isNativeShellRequest();
  return (
    <div className="studio-public studio-legal min-h-screen flex flex-col text-white">
      <header
        data-testid="legal-header"
        className="sticky top-0 z-50 border-b border-ink-600 bg-ink-950 pt-[env(safe-area-inset-top)]"
      >
        <div className="max-w-7xl mx-auto px-6 md:px-12 h-16 flex items-center justify-between">
          <Link
            href="/"
            data-testid="legal-logo"
            className="group inline-flex items-center"
            aria-label="tradies2Quote home"
          >
            <Logo size={32} />
          </Link>
          <Link
            href="/"
            data-testid="legal-back-to-site"
            className="inline-flex items-center gap-2 text-sm font-medium text-ink-300 hover:text-white transition-colors"
          >
            <ArrowLeft size={16} weight="bold" />
            <span className="hidden sm:inline">Back to site</span>
            <span className="sm:hidden">Home</span>
          </Link>
        </div>
      </header>

      <SectionTabs />

      <main className="flex-1">{children}</main>

      <Footer hidePricingLinks={nativeShell} />
    </div>
  );
}
