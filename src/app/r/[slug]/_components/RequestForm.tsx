"use client";

import { useState } from "react";
import { CheckCircle, PaperPlaneTilt } from "@phosphor-icons/react";

const INPUT =
  "mt-1 block w-full rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-brand";
const LABEL = "font-mono text-xs uppercase tracking-[0.2em] text-ink-400";
const MIN_DESCRIPTION = 20;

export function RequestForm({ slug, business }: { slug: string; business: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — humans never see it
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string>("");

  const canSubmit =
    state === "idle" &&
    name.trim().length >= 2 &&
    description.trim().length >= MIN_DESCRIPTION &&
    (phone.trim().length > 0 || email.trim().length > 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setState("sending");
    setError("");
    try {
      const res = await fetch(`/api/requests/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, phone, email, address, description, website }),
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setState("idle");
        return;
      }
      setState("sent");
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <section
        data-testid="request-sent"
        className="t2q-card-pro space-y-3 p-5 sm:p-6"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <CheckCircle size={28} weight="fill" className="text-brand" />
          <h2 className="font-display text-xl uppercase tracking-tight">Sent to {business}</h2>
        </div>
        <p className="text-sm text-ink-200">
          Thanks {name.trim()}. {business} has your request and will come back to you
          {phone.trim() ? ` on ${phone.trim()}` : email.trim() ? ` at ${email.trim()}` : ""} with a quote.
        </p>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="t2q-card-pro space-y-4 p-5 sm:p-6" noValidate>
      <div>
        <label className={LABEL} htmlFor="rq-description">
          What do you need done? *
        </label>
        <textarea
          id="rq-description"
          data-testid="request-description"
          className={`${INPUT} min-h-36`}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={3000}
          placeholder="e.g. Replace about 12 metres of old timber fence along the driveway, 1.8 high, and take the old one away."
          required
        />
        <p className="mt-1 text-xs text-ink-500">
          Sizes, materials and anything already on site help get you an accurate quote.
          {description.trim().length > 0 && description.trim().length < MIN_DESCRIPTION
            ? ` A few more words please (${MIN_DESCRIPTION - description.trim().length} to go).`
            : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="rq-name">
            Your name *
          </label>
          <input
            id="rq-name"
            data-testid="request-name"
            className={INPUT}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoComplete="name"
            required
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="rq-phone">
            Phone
          </label>
          <input
            id="rq-phone"
            data-testid="request-phone"
            className={INPUT}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            autoComplete="tel"
            maxLength={30}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="rq-email">
            Email
          </label>
          <input
            id="rq-email"
            data-testid="request-email"
            className={INPUT}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            inputMode="email"
            autoComplete="email"
            maxLength={254}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="rq-address">
            Job address
          </label>
          <input
            id="rq-address"
            data-testid="request-address"
            className={INPUT}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            autoComplete="street-address"
            maxLength={200}
          />
        </div>
      </div>

      {/* Honeypot: off-screen, tab-skipped, autocomplete off. Bots fill it, people don't. */}
      <div aria-hidden="true" className="absolute -left-[9999px] top-0 h-0 w-0 overflow-hidden">
        <label htmlFor="rq-website">Website</label>
        <input
          id="rq-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>

      <p className="text-xs text-ink-500">Give a phone number or an email so {business} can reach you.</p>

      {error ? (
        <p
          role="alert"
          data-testid="request-error"
          className="rounded-sm border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        data-testid="request-submit"
        className="t2q-btn-primary-pro w-full disabled:cursor-not-allowed disabled:opacity-50"
        disabled={!canSubmit}
      >
        <PaperPlaneTilt size={18} weight="bold" />
        {state === "sending" ? "Sending…" : `Send to ${business}`}
      </button>
    </form>
  );
}
