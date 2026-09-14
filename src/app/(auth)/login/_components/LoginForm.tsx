"use client";

import Link from "next/link";
import { PendingSubmit } from "../../_components/PendingSubmit";
import { useState } from "react";
import {
  ArrowRight,
  Envelope,
  Eye,
  EyeSlash,
  Lock,
} from "@phosphor-icons/react";
import { Magnetic } from "../../../_components/landing/Magnetic";
import { loginAction, resendConfirmationAction } from "../actions";

/**
 * Client-side form for /login.
 *
 * Owns the password show/hide toggle and the magnetic CTA wrap. Submits
 * to `loginAction` (server action defined in `actions.ts`) — the same
 * action that has been in production since the auth flow shipped, with
 * unchanged inputs (`email`, `password`, optional `next`).
 *
 * Error/notice state is rendered by the parent server page from
 * `searchParams` so a failed action redirect lights up the right banner
 * here without a client round-trip.
 */
type Props = {
  next?: string;
  error?: string;
  message?: string;
};

export function LoginForm({ next, error, message }: Props) {
  const [show, setShow] = useState(false);

  // Offer a confirmation-email resend whenever the banner is about
  // confirming (post-signup "check your inbox", Supabase "Email not
  // confirmed" login error, or the resend action's own neutral reply).
  const confirmRelated = /confirm/i.test(`${message ?? ""} ${error ?? ""}`);

  return (
    <>
    <form action={loginAction} className="space-y-4" data-testid="login-form">
      <input type="hidden" name="next" value={next ?? "/app"} />

      {message && (
        <div
          role="status"
          className="border border-hivis/40 bg-hivis/10 px-3 py-2 text-sm text-hivis rounded-sm"
        >
          {message}
        </div>
      )}
      {error && (
        <div
          role="alert"
          className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 rounded-sm"
          data-testid="login-error"
        >
          {error}
        </div>
      )}

      <Field
        icon={Envelope}
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        testId="login-email"
      />
      <Field
        icon={Lock}
        label="Password"
        name="password"
        type={show ? "text" : "password"}
        autoComplete="current-password"
        required
        testId="login-password"
        right={
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="text-ink-400 hover:text-white"
            data-testid="login-password-toggle"
          >
            {show ? (
              <EyeSlash size={16} weight="bold" />
            ) : (
              <Eye size={16} weight="bold" />
            )}
          </button>
        }
      />

      <Magnetic strength={0.18} className="w-full">
        <PendingSubmit data-testid="login-submit" pendingLabel="Signing in…">
          Sign in <ArrowRight size={20} weight="bold" />
        </PendingSubmit>
      </Magnetic>

      <div className="flex items-center justify-between text-sm">
        <Link
          href="/forgot-password"
          className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-300 hover:text-white"
          data-testid="login-forgot"
        >
          Forgot password?
        </Link>
        <span className="text-ink-400">
          No account?{" "}
          <Link
            href={`/signup?next=${encodeURIComponent(next ?? "/app")}`}
            className="text-brand hover:text-hivis font-semibold"
            data-testid="login-to-signup"
          >
            Start free
          </Link>
        </span>
      </div>
    </form>

    {/* Wave 40 — resend the signup confirmation email. Its own <form>
        (outside the login form — nested forms are invalid HTML) posting
        to a rate-limited, enumeration-safe server action. Only shown
        when the banner above is confirmation-related, so the login
        screen stays clean for everyone else. */}
    {confirmRelated && (
      <form
        action={resendConfirmationAction}
        className="mt-4 border border-ink-700 bg-ink-800/60 rounded-sm p-3 space-y-2"
        data-testid="resend-confirmation-form"
      >
        <input type="hidden" name="next" value={next ?? "/app"} />
        <div className="text-sm text-ink-300">
          Didn&apos;t get the confirmation email?
        </div>
        <div className="flex gap-2">
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@yourbusiness.co.nz"
            data-testid="resend-confirmation-email"
            className="flex-1 h-10 rounded-sm border border-ink-600 bg-ink-900 px-3 text-sm text-white placeholder:text-ink-500 focus:border-brand focus:outline-none"
          />
          <button
            type="submit"
            className="h-10 px-4 rounded-sm border border-brand text-brand hover:bg-brand hover:text-white font-display text-xs uppercase tracking-tight transition-colors"
            data-testid="resend-confirmation-submit"
          >
            Resend
          </button>
        </div>
      </form>
    )}
    </>
  );
}

type FieldProps = {
  icon: React.ComponentType<{
    size?: number;
    weight?: "bold" | "regular" | "fill";
    className?: string;
  }>;
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  testId?: string;
  right?: React.ReactNode;
};

function Field({
  icon: Icon,
  label,
  name,
  type = "text",
  autoComplete,
  required,
  testId,
  right,
}: FieldProps) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-400">
        {label}
      </span>
      <span className="mt-1 flex items-center gap-2 h-12 px-3 bg-ink-800 border border-ink-600 focus-within:border-brand rounded-sm">
        <Icon size={16} weight="bold" className="text-brand shrink-0" />
        <input
          name={name}
          type={type}
          autoComplete={autoComplete}
          required={required}
          data-testid={testId}
          className="flex-1 bg-transparent outline-none text-white"
        />
        {right}
      </span>
    </label>
  );
}
