import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { Logo } from "../landing/Logo";
type Props = {
  visual: ReactNode;
  form: ReactNode;
  backHref?: string;
  reverse?: boolean;
  /**
   * Inside the iOS app (isNativeShellRequest): no way out to the website,
   * whose homepage shows plans and prices (App Store 3.1.3(f)), so no
   * "Back to website" and the logos aren't links. Small Privacy policy and
   * Terms links sit at the foot instead (5.1.1(i)).
   */
  native?: boolean;
};
/** Shared presentation only: server actions and form state stay with each page. */
export function AuthSplitShell({
  visual,
  form,
  backHref = "/",
  reverse = false,
  native = false,
}: Props) {
  return (
    <div
      data-testid="auth-split-shell"
      className={`studio-auth-shell ${reverse ? "studio-auth-reverse" : ""}`}
    >
      <aside aria-label="What Tradies2Quote does" className="studio-auth-aside">
        {native ? (
          <Logo size={34} />
        ) : (
          <Link href="/" aria-label="Tradies2Quote home">
            <Logo size={34} />
          </Link>
        )}
        {visual}
      </aside>
      <div className="studio-auth-form-side">
        <div className="studio-auth-top">
          {native ? (
            <>
              <span />
              <span className="studio-auth-mobile-logo">
                <Logo size={28} withWordmark={false} />
              </span>
            </>
          ) : (
            <>
              <Link href={backHref} data-testid="auth-back">
                <ArrowLeft size={17} /> Back to website
              </Link>
              <Link
                href="/"
                aria-label="Tradies2Quote home"
                className="studio-auth-mobile-logo"
              >
                <Logo size={28} withWordmark={false} />
              </Link>
            </>
          )}
        </div>
        <div className="studio-auth-form">{form}</div>
        {native ? (
          // In the app the privacy policy and terms are one tap away before
          // signing in or signing up (App Store 5.1.1(i)).
          <div className="studio-auth-foot">
            <p>Built by a builder in New Zealand. Made for the trades.</p>
            <nav aria-label="Privacy and terms" className="flex justify-center gap-5">
              <Link
                href="/privacy"
                data-testid="auth-privacy"
                className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-white"
              >
                Privacy policy
              </Link>
              <Link
                href="/terms"
                data-testid="auth-terms"
                className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-white"
              >
                Terms
              </Link>
            </nav>
          </div>
        ) : (
          <p className="studio-auth-foot">
            Built by a builder in New Zealand. Made for the trades.
          </p>
        )}
      </div>
    </div>
  );
}
