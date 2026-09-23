import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, House } from "@phosphor-icons/react/dist/ssr";

export const metadata: Metadata = {
  title: "Page not found",
};

/**
 * Global 404 — shown for any unmatched URL and any `notFound()` call
 * outside `/app/*`. Renders inside the root layout, so the fonts, theme
 * boot and the base `bg-ink-900` body styles are already applied.
 *
 * Server component — pure static UI, no state, no interactivity beyond
 * the two links.
 */
export default function NotFound() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-20 text-center">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 t2q-grid-bg opacity-30"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-40 -right-40 h-[420px] w-[420px] rounded-full bg-brand/20 blur-3xl"
      />

      <div className="relative">
        <Link href="/" aria-label="tradies2Quote home" className="inline-flex">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-horizontal.webp"
            alt="Tradies2Quote"
            width={424}
            height={200}
            className="mx-auto block h-9 w-auto"
          />
        </Link>

        <p className="mt-10 font-mono text-[11px] uppercase tracking-[0.3em] text-brand">
          {"// 404"}
        </p>
        <h1 className="mt-3 font-display text-4xl uppercase tracking-tight sm:text-5xl">
          That page isn&apos;t on site.
        </h1>
        <p className="mx-auto mt-4 max-w-md text-sm text-ink-300 sm:text-base">
          The link might be old, or the quote you&apos;re after has moved.
          Nothing&apos;s broken — let&apos;s get you back on the tools.
        </p>

        <div className="mt-8 flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3">
          <Link
            href="/"
            data-testid="not-found-home"
            className="t2q-btn-primary-pro inline-flex h-11 items-center justify-center gap-2 px-5"
          >
            <ArrowLeft size={16} weight="bold" />
            Back to home
          </Link>
          <Link
            href="/app"
            data-testid="not-found-dashboard"
            className="t2q-btn-ghost-pro inline-flex h-11 items-center justify-center gap-2 px-5"
          >
            <House size={16} weight="bold" />
            Go to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
