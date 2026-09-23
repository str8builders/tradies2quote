"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { List, X } from "@phosphor-icons/react";
import { Logo } from "./Logo";

// Phones get a compact "Start free" button next to the menu. It used to be an
// Install button, but a first-time visitor should be asked to try the product
// before installing it; install lives in the menu and inside the app.
//
// The desktop bar switches on at `lg`, not `md`. Between 768px and ~940px the
// four original nav labels plus Sign in plus the trial button already wrapped
// onto two lines and collided with the wordmark; adding a fifth made it worse.
// Below 1024 the hamburger now takes over — and it lists every link, so nothing
// is lost at those widths.

const LINKS = [
  { href: "#demo-reel", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#calculator", label: "Calculators" },
  { href: "#pricing", label: "Pricing" },
  { href: "#faq", label: "FAQ" },
];

// Sections the iOS App Store shell must not link to. Pricing and the FAQ carry
// tier prices (3.1.3(f)); the calculator section advertises a native iOS app
// distributed outside the App Store (2.5.2). Both are withheld server-side on
// the page itself — these nav labels have to go with them.
const NATIVE_SHELL_HIDDEN = new Set(["#pricing", "#faq", "#calculator"]);

export function Header({
  // 3.1.3(f) — set server-side (see src/lib/native-shell.ts) inside the iOS
  // App Store shell, where the Pricing/FAQ sections are withheld: the nav
  // labels pointing at them must vanish from the served HTML too.
  hidePricingLinks = false,
}: {
  hidePricingLinks?: boolean;
} = {}) {
  const links = hidePricingLinks
    ? LINKS.filter((l) => !NATIVE_SHELL_HIDDEN.has(l.href))
    : LINKS;
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); toggleRef.current?.focus(); }
    };
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onDesktop = () => { if (desktop.matches) setOpen(false); };
    desktop.addEventListener("change", onDesktop);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); desktop.removeEventListener("change", onDesktop); };
  }, [open]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-testid="site-header"
      // Wave 14.1 — pt-[env(safe-area-inset-top)] paints the header
      // bg up under the iPhone notch / Android camera cutout so the
      // landing feels edge-to-edge. The inner h-16 row stays below
      // the inset so the logo and nav links never get clipped.
      className={`sticky top-0 z-50 border-b border-ink-600 bg-ink-950 pt-[env(safe-area-inset-top)] transition-shadow ${
        scrolled ? "shadow-[0_1px_0_0_#FF5F15]" : ""
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12 h-16 flex items-center justify-between">
        <Link
          href="/"
          data-testid="nav-logo"
          className="group inline-flex items-center text-white"
          aria-label="tradies2Quote home"
        >
          {/* Wave 19.4 — replaced the PNG-in-a-white-pill with the
              first-class <Logo /> SVG mark. Wave 19.8 — swapped the
              caution-tape SVG for the new T2Q wordmark. Wave 19.9 —
              wordmark hides on mobile so the burger menu has room
              to breathe; T2Q alone reads as the brand on a phone
              and TRADIES2QUOTE rejoins it on tablet/desktop. */}
          {/* …and rejoins at xl, not md: the wordmark is the widest item in
              the bar, and between lg and xl it was overlapping the first nav
              label. T2Q alone still reads as the brand. */}
          <Logo size={44} wordmarkClassName="hidden xl:inline" />
        </Link>

        <nav className="hidden lg:flex items-center gap-8" data-testid="nav-primary">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              data-testid={`nav-link-${l.href.replace("#", "")}`}
              className="whitespace-nowrap text-sm font-medium text-ink-200 hover:text-white transition-colors"
            >
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden lg:flex items-center gap-3">
          <Link
            href="/login"
            data-testid="nav-sign-in"
            className="whitespace-nowrap text-sm font-semibold text-ink-200 hover:text-white px-3"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            data-testid="nav-start-free"
            className="inline-flex items-center h-10 whitespace-nowrap px-4 bg-brand text-ink-900 font-display text-sm tracking-tight uppercase rounded-sm hover:bg-hivis transition-colors"
          >
            Start free trial
          </Link>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <Link
            href="/signup"
            data-testid="nav-mobile-start-free-compact"
            className="inline-flex min-h-11 items-center whitespace-nowrap rounded-sm bg-brand px-3.5 font-display text-xs uppercase tracking-tight text-ink-900 hover:bg-hivis transition-colors"
          >
            Start free
          </Link>
          <button
            ref={toggleRef}
            type="button"
            className="text-white min-h-11 min-w-11 grid place-items-center"
            aria-expanded={open}
            aria-controls="mobile-site-navigation"
            data-testid="nav-mobile-toggle"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close navigation" : "Open navigation"}
          >
            {open ? (
              <X size={24} weight="bold" />
            ) : (
              <List size={24} weight="bold" />
            )}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-site-navigation" className="lg:hidden border-t border-ink-600 bg-ink-950">
          <div className="flex flex-col px-6 py-4 gap-3">
            {links.map((l) => (
              <a
                key={l.href}
                href={l.href}
                data-testid={`nav-mobile-link-${l.href.replace("#", "")}`}
                onClick={() => setOpen(false)}
                className="py-3 text-base text-ink-200"
              >
                {l.label}
              </a>
            ))}
            <div className="flex gap-3 pt-3 border-t border-ink-600">
              <Link
                href="/login"
                data-testid="nav-mobile-sign-in"
                className="flex-1 t2q-btn-ghost text-center"
                onClick={() => setOpen(false)}
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                data-testid="nav-mobile-start-free"
                className="flex-1 t2q-btn-primary text-center"
                onClick={() => setOpen(false)}
              >
                Start free trial
              </Link>
            </div>
            <Link
              href="/install"
              data-testid="nav-mobile-install"
              onClick={() => setOpen(false)}
              className="py-2 text-center text-sm text-ink-300 underline underline-offset-4"
            >
              Install the app on your phone
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
