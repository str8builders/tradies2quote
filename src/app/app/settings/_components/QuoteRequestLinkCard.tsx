"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowSquareOut, Copy, LinkSimple } from "@phosphor-icons/react";
import {
  disableQuoteRequestLink,
  enableQuoteRequestLink,
} from "../request-link-actions";

export function QuoteRequestLinkCard({
  initialSlug,
  appUrl,
  hasBusinessName,
}: {
  initialSlug: string | null;
  appUrl: string;
  hasBusinessName: boolean;
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
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/app/requests" className="text-sm text-brand underline-offset-4 hover:underline">
              See requests
            </Link>
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
