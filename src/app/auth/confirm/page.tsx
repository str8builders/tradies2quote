import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard, SubmitButton } from "@/app/(auth)/_components/AuthCard";
import {
  confirmCopyFor,
  failureRedirectFor,
  isEmailLinkType,
  parseEmailLinkParams,
} from "@/lib/auth/emailLink";
import { confirmEmailLinkAction } from "./actions";

export const metadata: Metadata = {
  title: "Continue",
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Landing page for the password-reset and sign-up emails. It shows one big
 * button; the token is only used when the tradie taps it (POST), so email
 * link-scanners that open links in advance cannot use it up.
 */
export default async function ConfirmEmailLinkPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const rawType = first(sp.type);
  const params = parseEmailLinkParams({
    token_hash: first(sp.token_hash),
    type: rawType,
    next: first(sp.next),
  });
  if (!params) redirect(failureRedirectFor(isEmailLinkType(rawType) ? rawType : null));

  const copy = confirmCopyFor(params.type);

  return (
    <div className="studio-public studio-auth-pages">
      <div className="relative min-h-screen flex flex-col bg-ink-900 text-white overflow-hidden">
        <div className="pointer-events-none absolute inset-0 t2q-grid-bg opacity-30" />

        <header className="relative z-10 border-b border-ink-600">
          <div className="mx-auto flex h-16 max-w-6xl items-center px-6">
            <Link
              href="/"
              aria-label="tradies2Quote home"
              className="inline-flex w-fit items-center rounded-lg bg-[#0A0A0A] px-2.5 py-1.5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-horizontal.webp"
                alt="Tradies2Quote"
                width={424}
                height={200}
                className="block h-9 w-auto"
              />
            </Link>
          </div>
        </header>

        <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-12">
          <div className="w-full max-w-md">
            <AuthCard title={copy.title} subtitle={copy.subtitle}>
              <form action={confirmEmailLinkAction} className="space-y-4">
                <input type="hidden" name="token_hash" value={params.tokenHash} />
                <input type="hidden" name="type" value={params.type} />
                <input type="hidden" name="next" value={params.next} />
                <SubmitButton>{copy.button}</SubmitButton>
              </form>
              <p className="mt-6 text-center text-sm text-ink-300">
                Didn&apos;t ask for this? You can close this page. Nothing changes until you tap the button.
              </p>
            </AuthCard>
          </div>
        </main>
      </div>
    </div>
  );
}
