import type { ReactNode } from "react";
import { AuthField, type AuthFieldProps } from "./AuthField";
import { PendingSubmit } from "./PendingSubmit";

/**
 * Auth-form primitives shared by the simpler `/forgot-password` and
 * `/reset-password` pages. The marquee `/login` and `/signup` pages have
 * their own bespoke split-screen shell and do NOT use these primitives, but
 * they share <AuthField>, <AuthBanner> and the data-auth-* look in
 * redesign.css ("Sign-in pages"): plain, big, high-contrast type.
 *
 * Originally these components used semantic tokens (`bg-surface`,
 * `text-ink`, `accent`) that aren't declared in our Tailwind v4 `@theme`
 * block, so the form rendered unstyled in production. They now use the
 * landing-page design tokens (`bg-ink-800`, `border-ink-600`, `bg-brand`,
 * …) so the cards visually match the rest of the site.
 */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="border border-ink-600 bg-ink-800 rounded-sm p-6 sm:p-8 t2q-shadow-brutal">
      <div data-auth-eyebrow className="font-mono uppercase text-brand mb-2">
        {"// account"}
      </div>
      <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-tighter leading-[0.95] text-white">
        {title}
      </h1>
      {subtitle ? (
        <p data-auth-lead className="mt-3">
          {subtitle}
        </p>
      ) : null}
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function FormField(props: Omit<AuthFieldProps, "type"> & { type?: string }) {
  const type = props.type === "password" || props.type === "email" ? props.type : "text";
  return <AuthField {...props} type={type} />;
}

export function SubmitButton({ children }: { children: ReactNode }) {
  return <PendingSubmit>{children}</PendingSubmit>;
}

/**
 * A message above a form. An error is announced at once (role="alert"), a
 * notice politely (role="status"). Plain words at reading size, in a box with
 * a coloured edge, never colour alone.
 */
export function AuthBanner({
  kind,
  children,
  testId,
}: {
  kind: "error" | "notice";
  children: ReactNode;
  testId?: string;
}) {
  return (
    <div role={kind === "error" ? "alert" : "status"} data-auth-banner={kind} data-testid={testId}>
      {children}
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <AuthBanner kind="error">{message}</AuthBanner>;
}

export function FormNotice({ message }: { message?: string }) {
  if (!message) return null;
  return <AuthBanner kind="notice">{message}</AuthBanner>;
}
