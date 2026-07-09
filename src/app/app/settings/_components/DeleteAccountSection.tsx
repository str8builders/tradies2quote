"use client";

import { useState, useTransition } from "react";
import { Trash, Warning } from "@phosphor-icons/react";
import { deleteAccountAction } from "../delete-account-actions";

/**
 * Danger zone — in-app account deletion (Apple Guideline 5.1.1(v)).
 *
 * Two-step: an "I want to delete my account" disclosure, then a typed
 * DELETE confirmation before the server action runs. The action signs
 * the user out and redirects to the landing page on success.
 */
export function DeleteAccountSection() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setError("");
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await deleteAccountAction(fd);
      // On success the action redirects — we only land here on failure.
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <section
      data-testid="settings-delete-account-block"
      className="t2q-card-pro mt-6 border-red-900/60 p-5 sm:p-6"
    >
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-red-400">
        {"// danger zone"}
      </p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-display text-sm uppercase tracking-tight text-white">
            Delete account
          </p>
          <p className="mt-0.5 text-xs text-ink-300">
            Permanently removes your login, quotes, invoices, clients,
            materials and files. This cannot be undone.
          </p>
        </div>
        {!open ? (
          <button
            type="button"
            data-testid="settings-delete-account-open"
            onClick={() => setOpen(true)}
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-sm border border-red-600 px-4 font-mono text-[10px] uppercase tracking-[0.2em] text-red-400 transition-colors hover:bg-red-600 hover:text-white"
          >
            <Trash size={14} weight="bold" />
            Delete account
          </button>
        ) : null}
      </div>

      {open ? (
        <form onSubmit={onSubmit} className="mt-4 border-t border-ink-700 pt-4">
          <div className="flex items-start gap-2 rounded-sm border border-red-900/60 bg-red-950/30 p-3">
            <Warning size={16} weight="bold" className="mt-0.5 shrink-0 text-red-400" />
            <p className="text-xs text-ink-200">
              Everything goes: your business profile, all quotes and their
              PDFs, invoices, clients, material library, calendar notes and
              any active subscription is cancelled. Records we are legally
              required to keep (e.g. tax records for payments already made)
              are retained only as long as the law requires.
            </p>
          </div>
          <label
            htmlFor="delete-account-confirm"
            className="mt-4 block font-mono text-[10px] uppercase tracking-[0.2em] text-ink-300"
          >
            Type DELETE to confirm
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              id="delete-account-confirm"
              name="confirm"
              data-testid="settings-delete-account-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="DELETE"
              className="h-11 w-full rounded-sm border border-ink-700 bg-ink-900 px-3 font-mono text-sm text-white placeholder:text-ink-600 outline-none focus:border-red-500 sm:max-w-[180px]"
            />
            <button
              type="submit"
              data-testid="settings-delete-account-submit"
              disabled={confirm !== "DELETE" || pending}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-red-600 bg-red-600 px-4 font-mono text-[10px] uppercase tracking-[0.2em] text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash size={14} weight="bold" />
              {pending ? "Deleting…" : "Delete forever"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setConfirm("");
                setError("");
              }}
              disabled={pending}
              className="inline-flex h-11 items-center justify-center rounded-sm border border-ink-600 px-4 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-200 transition-colors hover:border-ink-400 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
          {error ? (
            <p
              data-testid="settings-delete-account-error"
              className="mt-3 text-xs text-red-400"
            >
              {error}
            </p>
          ) : null}
        </form>
      ) : null}
    </section>
  );
}
