"use client";

import { useState, useTransition } from "react";
import { Star, ChatCircleDots } from "@phosphor-icons/react";
import { saveEngagementSettings } from "../engagement-actions";

type Props = {
  initial: {
    googleReviewUrl: string;
    autoReview: boolean;
    autoFollowup: boolean;
  };
  /** Which sub-features are switched on at the platform level. */
  show: { reviews: boolean; followups: boolean };
};

export function EngagementSettings({ initial, show }: Props) {
  const [googleReviewUrl, setUrl] = useState(initial.googleReviewUrl);
  const [autoReview, setAutoReview] = useState(initial.autoReview);
  const [autoFollowup, setAutoFollowup] = useState(initial.autoFollowup);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onSave() {
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const res = await saveEngagementSettings({ googleReviewUrl, autoReview, autoFollowup });
      if (!res.ok) {
        setError(res.error ?? "Could not save.");
        return;
      }
      setSaved(true);
    });
  }

  return (
    <section className="t2q-card-pro mt-6 p-4 sm:p-5" aria-labelledby="engagement-settings-title">
      <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">
        {"// win more, get reviewed"}
      </div>
      <h2
        id="engagement-settings-title"
        className="mt-2 font-display text-lg uppercase tracking-tight text-white sm:text-xl"
      >
        Follow-ups &amp; reviews.
      </h2>
      <p className="mt-2 text-sm text-ink-300">
        Let T2Q automatically chase unaccepted quotes and ask happy clients for a review.
      </p>

      <div className="mt-5 space-y-4">
        {show.reviews ? (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-ink-400">
                Your Google review link
              </span>
              <input
                value={googleReviewUrl}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://g.page/r/…/review"
                className="w-full"
                inputMode="url"
              />
            </label>

            <ToggleRow
              icon={<Star size={18} weight="fill" className="text-brand" />}
              title="Auto-ask for reviews"
              desc="When a job is marked complete, email the client your review link (once)."
              checked={autoReview}
              onChange={setAutoReview}
            />
          </>
        ) : null}

        {show.followups ? (
          <ToggleRow
            icon={<ChatCircleDots size={18} weight="fill" className="text-brand" />}
            title="Auto follow-up on quotes"
            desc="Email the client a reminder at day 2 and day 5 if a quote you emailed hasn't been accepted."
            checked={autoFollowup}
            onChange={setAutoFollowup}
          />
        ) : null}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={pending}
          className="t2q-btn-primary-pro inline-flex items-center disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {saved ? <span className="text-sm text-emerald-500">Saved.</span> : null}
        {error ? <span className="text-sm text-red-500">{error}</span> : null}
      </div>
    </section>
  );
}

function ToggleRow({
  icon,
  title,
  desc,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-black/10 p-3">
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink-900">{title}</span>
        <span className="block text-xs text-ink-400">{desc}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-5 w-5 shrink-0 accent-[#FF5F15]"
      />
    </label>
  );
}
