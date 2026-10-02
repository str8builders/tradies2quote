"use client";

import Link from "next/link";
import { PendingSubmit } from "../../_components/PendingSubmit";
import { rememberEmail, restoreEmailInto } from "../../_components/remembered-email";
import { useEffect, useRef } from "react";
import { ArrowRight, Envelope, Lock } from "@phosphor-icons/react";
import { Magnetic } from "../../../_components/landing/Magnetic";
import { AuthBanner } from "../../_components/AuthCard";
import { AuthField } from "../../_components/AuthField";
import { loginAction, resendConfirmationAction } from "../actions";

/**
 * Client-side form for /login.
 *
 * Owns the magnetic CTA wrap (the password's Show / Hide button lives in
 * <AuthField>). Submits to `loginAction` (server action defined in
 * `actions.ts`) — the same action that has been in production since the auth
 * flow shipped, with unchanged inputs (`email`, `password`, optional `next`).
 *
 * Error/notice state is rendered by the parent server page from
 * `searchParams` so a failed action redirect lights up the right banner
 * here without a client round-trip.
 *
 * Plain, big, high-contrast type for older eyes and bright sun: see
 * redesign.css, "Sign-in pages".
 */
type Props = {
  next?: string;
  error?: string;
  message?: string;
  /** Inside the iOS app (on the server): "Create account", never "Start free" (App Store 3.1.3(f)). */
  native?: boolean;
};

export function LoginForm({ next, error, message, native = false }: Props) {
  const emailRef = useRef<HTMLInputElement>(null);
  // After a reload (an update landed mid-sign-in) or a failed attempt, the
  // email typed a moment ago comes back. Never the password.
  useEffect(() => {
    restoreEmailInto(emailRef.current);
  }, [error, message]);

  // Offer a confirmation-email resend whenever the banner is about
  // confirming (post-signup "check your inbox", Supabase "Email not
  // confirmed" login error, or the resend action's own neutral reply).
  const confirmRelated = /confirm/i.test(`${message ?? ""} ${error ?? ""}`);

  return (
    <>
    <form
      action={loginAction}
      onSubmit={(e) => rememberEmail(new FormData(e.currentTarget).get("email"))}
      className="space-y-5"
      data-testid="login-form"
    >
      <input type="hidden" name="next" value={next ?? "/app"} />

      {message ? <AuthBanner kind="notice">{message}</AuthBanner> : null}
      {error ? (
        <AuthBanner kind="error" testId="login-error">
          {error}
        </AuthBanner>
      ) : null}

      <AuthField
        icon={<Envelope aria-hidden="true" size={22} weight="bold" className="text-brand shrink-0" />}
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        testId="login-email"
        inputRef={emailRef}
      />
      <AuthField
        icon={<Lock aria-hidden="true" size={22} weight="bold" className="text-brand shrink-0" />}
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        testId="login-password"
        toggleTestId="login-password-toggle"
      />

      <Magnetic strength={0.18} fill>
        <PendingSubmit data-testid="login-submit" pendingLabel="Signing in…">
          Sign in <ArrowRight aria-hidden="true" size={22} weight="bold" />
        </PendingSubmit>
      </Magnetic>

      <div className="flex flex-col items-start">
        <Link href="/forgot-password" data-auth-link="quiet" data-testid="login-forgot">
          Forgot password?
        </Link>
        <p data-auth-note>
          No account?{" "}
          <Link
            href={`/signup?next=${encodeURIComponent(next ?? "/app")}`}
            data-auth-link
            data-testid="login-to-signup"
          >
            {native ? "Create account" : "Start free"}
          </Link>
        </p>
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
        className="mt-6 space-y-4"
        data-auth-panel
        data-testid="resend-confirmation-form"
      >
        <input type="hidden" name="next" value={next ?? "/app"} />
        <p data-auth-note>Didn&apos;t get the confirmation email?</p>
        <AuthField
          label="Your email"
          name="email"
          type="email"
          autoComplete="email"
          testId="resend-confirmation-email"
        />
        <button type="submit" data-auth-secondary data-testid="resend-confirmation-submit">
          Send it again
        </button>
      </form>
    )}
    </>
  );
}
