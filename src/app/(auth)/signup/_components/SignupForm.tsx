"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Envelope,
  Eye,
  EyeSlash,
  Lock,
} from "@phosphor-icons/react";
import { Magnetic } from "../../../_components/landing/Magnetic";
import { signupAction } from "../actions";

/**
 * Client-side form for /signup.
 *
 * Owns the password show/hide toggle and the magnetic CTA wrap. Submits
 * to the unchanged Supabase `signupAction` server action with `email` +
 * `password` only — those are the only fields the action reads today.
 *
 * The Emergent visual design also includes decorative fields for "Your
 * name", "Business name", and a "Trade" selector. Those are intentionally
 * NOT rendered here yet because `signupAction` doesn't persist them.
 * Wire them up in `actions.ts` first (e.g. into Supabase
 * `user_metadata.full_name` / `business_name` / `trade`) and then add
 * the visual fields back as a follow-up.
 */
type Props = {
  error?: string;
  next?: string;
};

export function SignupForm({ error, next }: Props) {
  const [show, setShow] = useState(false);

  return (
    <form
      action={signupAction}
      onSubmit={() => (window as unknown as { uw?: (e: string) => void }).uw?.("signup")}
      className="space-y-4"
      data-testid="signup-form"
    >
      <input type="hidden" name="next" value={next ?? "/app"} />
      {error && (
        <div
          role="alert"
          className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 rounded-sm"
          data-testid="signup-error"
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
        testId="signup-email"
      />
      <Field
        icon={Lock}
        label="Password"
        name="password"
        type={show ? "text" : "password"}
        autoComplete="new-password"
        required
        testId="signup-password"
        right={
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            className="text-ink-400 hover:text-white"
            data-testid="signup-password-toggle"
          >
            {show ? (
              <EyeSlash size={16} weight="bold" />
            ) : (
              <Eye size={16} weight="bold" />
            )}
          </button>
        }
      />
      <p className="text-xs text-ink-400">At least 8 characters.</p>

      <Magnetic strength={0.18} className="w-full">
        <button
          type="submit"
          className="w-full t2q-btn-primary-pro h-12"
          data-testid="signup-submit"
        >
          Start 7-day trial <ArrowRight size={20} weight="bold" />
        </button>
      </Magnetic>

      <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-ink-500">
        By signing up you agree to our terms · no card needed
      </p>

      <div className="text-sm text-ink-400">
        Already on it?{" "}
        <Link
          href={`/login?next=${encodeURIComponent(next ?? "/app")}`}
          className="text-brand hover:text-hivis font-semibold"
          data-testid="signup-to-login"
        >
          Sign in to your account
        </Link>
      </div>
    </form>
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
