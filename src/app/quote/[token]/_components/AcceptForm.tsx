"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle } from "@phosphor-icons/react/dist/ssr";
import { formatCurrency } from "@/lib/quote-defaults";
import type { PublicQuotePayload } from "@/lib/quote-types";
import { SignaturePad } from "./SignaturePad";

type Props = {
  token: string;
  quote: PublicQuotePayload;
};

const ERROR_MESSAGES: Record<string, string> = {
  consent_required: "Please tick the acceptance box.",
  name_required: "Please enter your name.",
  email_invalid: "That email doesn't look right.",
  signature_required: "Please sign in the signature pad.",
  signature_invalid_format: "Signature must be a PNG image.",
  signature_not_png: "Signature must be a PNG image.",
  signature_too_large: "Signature is too large (max 1MB).",
  signature_empty: "Please draw a signature before accepting.",
  signature_decode_failed: "Could not read your signature — try again.",
  signature_upload_failed: "Could not save your signature. Please try again.",
  expired: "Sorry — this quote has expired.",
  already_accepted: "This quote has already been accepted.",
  quote_changed: "This quote was updated — please review the latest version.",
  declined: "This quote is no longer available to accept.",
  not_available: "This quote is no longer available to accept.",
  not_found: "Quote not found.",
  accept_failed: "Something went wrong. Please try again.",
  invalid_body: "Could not read the form. Please reload and try again.",
};

/** The accept request: the form fields plus the revision and total shown. */
export function acceptRequestBody(
  quote: Pick<PublicQuotePayload, "version" | "total">,
  fields: { name: string; email: string; signature: string | null; accepted: boolean },
) {
  return JSON.stringify({ ...fields, version: quote.version, total: quote.total });
}

export function AcceptForm({ token, quote }: Props) {
  const router = useRouter();
  const [name, setName] = useState(quote.client.name ?? "");
  const [email, setEmail] = useState(quote.client.email ?? "");
  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/quote/${token}/accept`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: acceptRequestBody(quote, { name, email, signature, accepted }),
      });
      if (res.ok) {
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(ERROR_MESSAGES[data.error ?? ""] ?? "Could not accept quote.");
      setSubmitting(false);
      if (data.error === "quote_changed") {
        // Reload the quote in place (keeping name and email) and make the
        // customer tick acceptance again against the revised figures.
        setAccepted(false);
        router.refresh();
      }
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      data-testid="accept-form"
      className="t2q-card-pro space-y-4 p-5 sm:p-6"
    >
      <div>
        <h2 className="font-display text-xl uppercase tracking-tight">
          Accept this <span className="text-brand">quote.</span>
        </h2>
        <p className="mt-1 text-sm text-ink-300">
          Total <strong className="text-white">{formatCurrency(quote.total, quote.currency)}</strong> incl {quote.tax_label}.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          testId="accept-name"
          label="Your name"
          value={name}
          onChange={setName}
          required
          autoComplete="name"
        />
        <Field
          testId="accept-email"
          label="Your email"
          type="email"
          value={email}
          onChange={setEmail}
          required
          autoComplete="email"
        />
      </div>

      <div>
        <p className="mb-2 font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
          Signature
        </p>
        <SignaturePad onChange={setSignature} />
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-sm border border-ink-700 bg-ink-800 p-3">
        <input
          type="checkbox"
          data-testid="accept-checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-0.5 h-4 w-4 cursor-pointer accent-brand"
        />
        <span className="text-sm text-ink-200">
          I accept this quote and authorise the work as described above.
        </span>
      </label>

      {error && (
        <p
          data-testid="accept-error"
          className="rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        data-testid="accept-submit"
        disabled={submitting}
        className="t2q-btn-primary-pro w-full disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CheckCircle size={18} weight="bold" />
        {submitting ? "Accepting…" : "Accept and sign"}
      </button>
    </form>
  );
}

function Field({
  testId,
  label,
  value,
  onChange,
  required,
  type = "text",
  autoComplete,
}: {
  testId: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-400">
        {label}
        {required && <span className="ml-1 text-brand">*</span>}
      </span>
      <input
        data-testid={testId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoComplete={autoComplete}
        className="mt-1 block w-full rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-brand"
      />
    </label>
  );
}
