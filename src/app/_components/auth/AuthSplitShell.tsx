import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { Logo } from "../landing/Logo";
type Props = {
  visual: ReactNode;
  form: ReactNode;
  backHref?: string;
  reverse?: boolean;
};
/** Shared presentation only: server actions and form state stay with each page. */
export function AuthSplitShell({
  visual,
  form,
  backHref = "/",
  reverse = false,
}: Props) {
  return (
    <div
      data-testid="auth-split-shell"
      className={`studio-auth-shell ${reverse ? "studio-auth-reverse" : ""}`}
    >
      <aside aria-label="What Tradies2Quote does" className="studio-auth-aside">
        <Link href="/" aria-label="Tradies2Quote home">
          <Logo size={34} />
        </Link>
        {visual}
      </aside>
      <div className="studio-auth-form-side">
        <div className="studio-auth-top">
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
        </div>
        <div className="studio-auth-form">{form}</div>
        <p className="studio-auth-foot">
          Built by a builder in New Zealand. Made for the trades.
        </p>
      </div>
    </div>
  );
}
