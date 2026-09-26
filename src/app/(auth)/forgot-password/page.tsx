import Link from "next/link";
import { isNativeShellRequest } from "@/lib/native-shell";
import type { Metadata } from "next";
import { forgotPasswordAction } from "./actions";
import {
  AuthCard,
  FormError,
  FormField,
  FormNotice,
  SubmitButton,
} from "../_components/AuthCard";

export const metadata: Metadata = {
  title: "Forgot password",
};

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const { error, message } = await searchParams;
  // In the iPhone app the logo leads back to sign in, not the website's
  // homepage, whose HTML carries its trial offers (App Store 3.1.3(f)).
  const native = await isNativeShellRequest();

  return (
    <div className="relative min-h-screen flex flex-col bg-ink-900 text-white overflow-hidden">
      <div className="pointer-events-none absolute inset-0 t2q-grid-bg opacity-30" />
      <div className="pointer-events-none absolute -top-40 -right-40 w-[480px] h-[480px] rounded-full bg-brand/20 blur-3xl animate-blob" />

      <header className="relative z-10 border-b border-ink-600">
        <div className="mx-auto flex h-16 max-w-6xl items-center px-6">
          <Link
            href={native ? "/login" : "/"}
            aria-label={native ? "Back to sign in" : "tradies2Quote home"}
            className="inline-flex w-fit items-center rounded-lg bg-[#0A0A0A] px-2.5 py-1.5"
          >
            {/* Dark plate so the near-white T/Q glyphs stay legible on the
                cream light-theme background (bg-ink-950 would remap to
                cream, so use a literal #0A0A0A). */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-horizontal.webp"
              alt="Tradies2Quote"
              width={424}
              height={200}
              className="block h-9 w-auto"
            />
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <AuthCard
            title="Reset your password"
            subtitle="Enter your email and we'll send you a reset link."
          >
            <form action={forgotPasswordAction} className="space-y-4">
              <FormNotice message={message} />
              <FormError message={error} />
              <FormField
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
              />
              <SubmitButton>Send reset link</SubmitButton>
            </form>

            <p className="mt-6 text-center text-sm">
              <Link
                href="/login"
                className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-300 hover:text-white"
              >
                ← Back to sign in
              </Link>
            </p>
          </AuthCard>
        </div>
      </main>
    </div>
  );
}
