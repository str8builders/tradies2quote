"use client";
import { useFormStatus } from "react-dom";

/**
 * Submit button that disables itself while its form's server action is in
 * flight, so a double-tap or a repeated Enter cannot fire sign-in, sign-up or
 * a password email twice (audit 2026-09-15).
 */
export function PendingSubmit({ children, pendingLabel = "Working…", className = "w-full t2q-btn-primary-pro h-12", ...rest }: {
  children: React.ReactNode; pendingLabel?: string; className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type" | "className" | "children">) {
  const { pending } = useFormStatus();
  return <button type="submit" className={`${className} disabled:cursor-wait disabled:opacity-70`} disabled={pending} aria-busy={pending} {...rest}>
    {pending ? pendingLabel : children}
  </button>;
}
