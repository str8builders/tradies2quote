import Link from "next/link";
import { LEGAL } from "@/lib/legal";
import { Logo } from "./Logo";
import { MotionToggle } from "../wallpaper/MotionToggle";

export function Footer({
  // 3.1.3(f) — set server-side (see src/lib/native-shell.ts) inside the iOS
  // App Store shell: the "Pricing" footer link must not appear there.
  hidePricingLinks = false,
}: {
  hidePricingLinks?: boolean;
} = {}) {
  return (
    <footer
      data-testid="site-footer"
      className="studio-footer relative pt-16 pb-16"
    >
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-10 pt-8 border-t border-ink-700">
          <div className="col-span-2">
            {/* Wave 19.12 — <Logo> now renders the founder's real
                transparent T2Q artwork (light letterforms, orange 2)
                straight on the dark footer — no white pill. text-white
                still styles the TRADIES2QUOTE wordmark text beside it. */}
            <Logo size={40} className="text-white" />
            <p className="mt-4 text-ink-300 text-sm max-w-sm">
              Voice in. Quote out. Built in New Zealand by a qualified builder, made for the trades.
            </p>
          </div>
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-ink-300 mb-3">
              Product
            </div>
            <ul className="space-y-2 text-ink-200 text-sm">
              <li>
                <Link
                  href="/#demo-reel"
                  data-testid="footer-link-how"
                  className="hover:text-white"
                >
                  How it works
                </Link>
              </li>
              <li>
                <Link
                  href="/#features"
                  data-testid="footer-link-features"
                  className="hover:text-white"
                >
                  Features
                </Link>
              </li>
              {/* Both withheld inside the iOS App Store shell: pricing for
                  3.1.3(f), the calculator app because it is a native iOS app
                  distributed outside the App Store (2.5.2). */}
              {hidePricingLinks ? null : (
                <>
                  <li>
                    <Link
                      href="/t2qcal"
                      data-testid="footer-link-calculator"
                      className="hover:text-white"
                    >
                      Calculator app
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/#pricing"
                      data-testid="footer-link-pricing"
                      className="hover:text-white"
                    >
                      Pricing
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </div>
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-ink-300 mb-3">
              Account
            </div>
            <ul className="space-y-2 text-ink-200 text-sm">
              <li>
                <Link
                  href="/login"
                  data-testid="footer-link-sign-in"
                  className="hover:text-white"
                >
                  Sign in
                </Link>
              </li>
              <li>
                <Link
                  href="/signup"
                  data-testid="footer-link-start-trial"
                  className="hover:text-white"
                >
                  Start trial
                </Link>
              </li>
              <li>
                <Link
                  href="/install"
                  data-testid="footer-link-install"
                  className="hover:text-white"
                >
                  Install the app
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-ink-300 mb-3">
              Help
            </div>
            <ul className="space-y-2 text-ink-200 text-sm">
              <li>
                <Link
                  href="/support"
                  data-testid="footer-link-support"
                  className="hover:text-white"
                >
                  Support
                </Link>
              </li>
              <li>
                <a
                  href={`mailto:${LEGAL.supportEmail}`}
                  data-testid="footer-link-contact"
                  className="hover:text-white"
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-ink-300 mb-3">
              Legal
            </div>
            <ul className="space-y-2 text-ink-200 text-sm">
              <li>
                <Link
                  href="/privacy"
                  data-testid="footer-link-privacy"
                  className="hover:text-white"
                >
                  Privacy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  data-testid="footer-link-terms"
                  className="hover:text-white"
                >
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-12 pt-6 border-t border-ink-800 grid gap-3 text-xs font-mono uppercase tracking-[0.16em] text-ink-300">
          <div className="flex flex-col md:flex-row gap-3 justify-between">
            <span>© {new Date().getFullYear()} Tradies2Quote · Built in NZ</span>
            <span>Voice in. Quote out. Your final say.</span>
          </div>
          <div
            data-testid="footer-operator"
            className="text-[10px] tracking-[0.16em] text-ink-300/90 normal-case"
          >
            Operated by {LEGAL.companyName}
            {LEGAL.nzbn ? <> (NZBN {LEGAL.nzbn})</> : null}, {LEGAL.address}.
          </div>
          <MotionToggle />
        </div>
      </div>
    </footer>
  );
}
