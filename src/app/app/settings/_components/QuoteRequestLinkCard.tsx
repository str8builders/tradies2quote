"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowSquareOut, ArrowsClockwise, Copy, LinkSimple, Printer } from "@phosphor-icons/react";
import {
  disableQuoteRequestLink,
  enableQuoteRequestLink,
  rotateQuoteRequestLink,
} from "../request-link-actions";

export function QuoteRequestLinkCard({
  initialSlug,
  appUrl,
  hasBusinessName,
  hasLogo = false,
}: {
  initialSlug: string | null;
  appUrl: string;
  hasBusinessName: boolean;
  /** A business logo is set: it goes on the poster and in the middle of the PNG code. */
  hasLogo?: boolean;
}) {
  const [slug, setSlug] = useState<string | null>(initialSlug);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const link = slug ? `${appUrl.replace(/\/+$/, "")}/r/${slug}` : null;

  function run(action: () => Promise<{ ok: boolean; slug?: string | null; error?: string }>) {
    setError("");
    startTransition(async () => {
      const result = await action();
      if (result.ok) setSlug(result.slug ?? null);
      else setError(result.error ?? "Something went wrong.");
    });
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy — long-press the link to copy it.");
    }
  }

  return (
    <section
      id="request-link"
      data-testid="settings-request-link"
      aria-label="Quote request link"
      className="t2q-card-pro p-5 sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-sm border border-brand/40 bg-brand/10 text-brand">
          <LinkSimple size={20} weight="bold" />
        </span>
        <div>
          <div className="t2q-section-label-pro">{"// clients request quotes"}</div>
          <h2 className="font-display text-xl uppercase tracking-tight">Your request link</h2>
        </div>
      </div>
      <p className="mt-3 text-sm text-ink-300">
        Share this link on your website, Facebook page or van. A client describes the job in
        their own words; it lands here as a draft quote, already written up, for you to check
        and send. You always set the price.
      </p>

      {link ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <code
              data-testid="request-link-url"
              className="flex-1 truncate rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-hivis"
            >
              {link}
            </code>
            <button type="button" className="t2q-btn-ghost-pro" onClick={copy} disabled={pending}>
              <Copy size={16} weight="bold" />
              {copied ? "Copied" : "Copy"}
            </button>
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="t2q-btn-ghost-pro"
              aria-label="Open your request page"
            >
              <ArrowSquareOut size={16} weight="bold" />
              Open
            </a>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- authenticated SVG route, no optimiser */}
            <img
              src={`/api/account/request-qr?v=${encodeURIComponent(slug ?? "")}`}
              alt="QR code for your request link"
              width={144}
              height={144}
              className="h-36 w-36 rounded-sm border border-ink-700 bg-white p-1"
            />
            <div className="text-sm text-ink-300">
              <p>Put the QR on the van, site fence, business cards or your counter. Anyone who scans it lands on your request page.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href="/print/request-poster" className="t2q-btn-primary-pro" data-testid="request-poster-link">
                  <Printer size={16} weight="bold" />
                  Print poster
                </Link>
                <a href={`/api/account/request-qr?download=1&format=png&size=1024${hasLogo ? "&logo=1" : ""}`} className="t2q-btn-ghost-pro" data-testid="request-qr-png">
                  Download PNG{hasLogo ? " with logo" : ""}
                </a>
                <a href="/api/account/request-qr?download=1" className="t2q-btn-ghost-pro" data-testid="request-qr-svg">
                  Download SVG
                </a>
              </div>
              <p className="mt-2 text-xs text-ink-500">PNG for social posts and email. SVG for the sign writer, it prints sharp at any size.{hasLogo ? " Your logo sits in the middle of the poster code and the PNG." : ""}</p>
              {!hasLogo ? <p className="mt-1 text-xs text-hivis">Add your business logo above and it goes on the poster and in the middle of the code.</p> : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/app/requests" className="text-sm text-brand underline-offset-4 hover:underline">
              See requests
            </Link>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-sm text-ink-400 underline-offset-4 hover:underline"
              onClick={() => {
                if (window.confirm("Reset your link? Old QR codes and links will stop working — reprint anything you have shared.")) run(rotateQuoteRequestLink);
              }}
              disabled={pending}
              data-testid="request-link-reset"
            >
              <ArrowsClockwise size={14} weight="bold" />
              Reset link
            </button>
            <button
              type="button"
              className="text-sm text-ink-400 underline-offset-4 hover:underline"
              onClick={() => run(disableQuoteRequestLink)}
              disabled={pending}
            >
              Turn the link off
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4">
          <button
            type="button"
            data-testid="request-link-enable"
            className="t2q-btn-primary-pro disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => run(enableQuoteRequestLink)}
            disabled={pending || !hasBusinessName}
          >
            <LinkSimple size={18} weight="bold" />
            {pending ? "Setting up…" : "Turn on my request link"}
          </button>
          {!hasBusinessName ? (
            <p className="mt-2 text-xs text-hivis">Set your business name above first — it becomes your link.</p>
          ) : null}
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-3 rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}
    </section>
  );
}
