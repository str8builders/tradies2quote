"use client";

import { AI_CONSENT_VERSION, PUBLIC_AI_DISCLOSURE } from "@/lib/ai-disclosure";
import { useState } from "react";
import { Camera, CheckCircle, PaperPlaneTilt, X } from "@phosphor-icons/react";

const INPUT =
  "mt-1 block w-full rounded-sm border border-ink-600 bg-ink-900 px-3 py-2 text-sm text-white outline-none focus:border-brand";
const LABEL = "font-mono text-xs uppercase tracking-[0.2em] text-ink-400";
const MIN_DESCRIPTION = 20;
const MAX_PHOTOS = 3;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export function RequestForm({ slug, business }: { slug: string; business: string }) {
  const [allowAI, setAllowAI] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [website, setWebsite] = useState(""); // honeypot — humans never see it
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string>("");
  // Optional clarifying questions, fetched once the description is written.
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<string[]>([]);
  const [askedFor, setAskedFor] = useState<string>("");
  const [asking, setAsking] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoNote, setPhotoNote] = useState("");

  function addPhotos(list: FileList | null) {
    if (!list) return;
    const next = [...photos];
    let note = "";
    for (const file of Array.from(list)) {
      if (next.length >= MAX_PHOTOS) {
        note = `Up to ${MAX_PHOTOS} photos.`;
        break;
      }
      if (!/^image\/(jpeg|png|webp)$/i.test(file.type)) {
        note = "Use JPEG, PNG or WebP photos.";
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        note = "Each photo must be under 10 MB.";
        continue;
      }
      next.push(file);
    }
    setPhotos(next);
    setPhotoNote(note);
  }

  async function loadQuestions() {
    const text = description.trim();
    if (!allowAI || text.length < MIN_DESCRIPTION || text === askedFor || asking) return;
    setAskedFor(text);
    setAsking(true);
    try {
      const res = await fetch(`/api/requests/${encodeURIComponent(slug)}/questions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description: text, aiConsentVersion: AI_CONSENT_VERSION }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = (await res.json().catch(() => ({}))) as { questions?: unknown };
      const list = Array.isArray(data.questions)
        ? data.questions.filter((q): q is string => typeof q === "string").slice(0, 3)
        : [];
      setQuestions(list);
      setAnswers(list.map(() => ""));
    } catch {
      setQuestions([]);
      setAnswers([]);
    } finally {
      setAsking(false);
    }
  }

  function descriptionWithAnswers(): string {
    const answered = questions
      .map((q, i) => ({ q, a: answers[i]?.trim() ?? "" }))
      .filter((x) => x.a.length > 0);
    if (answered.length === 0) return description;
    return `${description.trim()}\n\nAnswers to follow-up questions:\n${answered
      .map((x) => `- ${x.q} ${x.a}`)
      .join("\n")}`;
  }

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
      const fields = {
        aiConsentVersion: allowAI ? AI_CONSENT_VERSION : "",
        name,
        phone,
        email,
        address,
        description: descriptionWithAnswers(),
        website,
      };
      let init: RequestInit;
      if (photos.length > 0) {
        const form = new FormData();
        for (const [k, v] of Object.entries(fields)) form.set(k, v);
        for (const file of photos) form.append("photos", file, file.name);
        init = { method: "POST", body: form, signal: AbortSignal.timeout(120_000) };
      } else {
        init = {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(fields),
          signal: AbortSignal.timeout(30_000),
        };
      }
      const res = await fetch(`/api/requests/${encodeURIComponent(slug)}`, init);
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
          onBlur={() => void loadQuestions()}
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

      {asking ? (
        <p className="text-xs text-ink-500" aria-live="polite">
          Checking whether anything else would help…
        </p>
      ) : null}
      {questions.length > 0 ? (
        <fieldset
          data-testid="request-questions"
          className="space-y-3 rounded-sm border border-ink-700 bg-ink-800 p-3"
        >
          <legend className={LABEL}>A couple of quick questions (optional)</legend>
          {questions.map((q, i) => (
            <div key={q}>
              <label className="text-sm text-ink-200" htmlFor={`rq-q-${i}`}>
                {q}
              </label>
              <input
                id={`rq-q-${i}`}
                className={INPUT}
                value={answers[i] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => prev.map((a, j) => (j === i ? e.target.value : a)))
                }
                maxLength={200}
              />
            </div>
          ))}
        </fieldset>
      ) : null}

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

      <div>
        <span className={LABEL}>Photos (optional)</span>
        <p className="mt-1 text-xs text-ink-500">
          A photo of the job helps {business} quote it right. Up to {MAX_PHOTOS}.
        </p>
        {photos.length > 0 ? (
          <ul className="mt-2 space-y-1" data-testid="request-photo-list">
            {photos.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className="flex items-center justify-between gap-2 rounded-sm border border-ink-700 bg-ink-800 px-3 py-2 text-sm text-ink-200"
              >
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  aria-label={`Remove ${file.name}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-ink-400 hover:text-white"
                  onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                >
                  <X size={16} weight="bold" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {photos.length < MAX_PHOTOS ? (
          <label className="mt-2 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-sm border border-ink-600 px-3 text-sm text-ink-200 hover:border-brand">
            <Camera size={18} weight="bold" className="text-brand" />
            Add a photo
            <input
              type="file"
              data-testid="request-photos"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="sr-only"
              onChange={(e) => {
                addPhotos(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        ) : null}
        {photoNote ? <p className="mt-1 text-xs text-hivis">{photoNote}</p> : null}
      </div>

      <label className="flex items-start gap-3 text-sm text-ink-300">
        <input type="checkbox" checked={allowAI} onChange={(event) => { setAllowAI(event.target.checked); if (!event.target.checked) { setQuestions([]); setAnswers([]); setAskedFor(""); } }} className="mt-1 h-5 w-5 shrink-0 accent-brand" />
        <span>{PUBLIC_AI_DISCLOSURE} <a href="/privacy" className="underline">Privacy Policy</a></span>
      </label>

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
        {state === "sending"
          ? photos.length > 0
            ? "Sending photos…"
            : "Sending…"
          : `Send to ${business}`}
      </button>
    </form>
  );
}
