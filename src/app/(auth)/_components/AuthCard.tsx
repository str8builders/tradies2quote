import { PendingSubmit } from "./PendingSubmit";
/**
 * Auth-form primitives shared by the simpler `/forgot-password` and
 * `/reset-password` pages. The marquee `/login` and `/signup` pages have
 * their own bespoke split-screen shell and do NOT use these primitives.
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
  children: React.ReactNode;
}) {
  return (
    <div className="border border-ink-600 bg-ink-800 rounded-sm p-6 sm:p-8 t2q-shadow-brutal">
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand mb-2">
        {"// account"}
      </div>
      <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-tighter leading-[0.95] text-white">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-3 text-sm text-ink-300">{subtitle}</p>
      ) : null}
      <div className="mt-6">{children}</div>
    </div>
  );
}

export function FormField({
  label,
  name,
  type = "text",
  autoComplete,
  required = true,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-400">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        className="mt-1 block w-full h-12 px-3 bg-ink-900 border border-ink-600 text-white outline-none focus:border-brand rounded-sm"
      />
    </label>
  );
}

export function SubmitButton({ children }: { children: React.ReactNode }) {
  return <PendingSubmit>{children}</PendingSubmit>;
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 rounded-sm">
      {message}
    </div>
  );
}

export function FormNotice({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="border border-hivis/40 bg-hivis/10 px-3 py-2 text-sm text-hivis rounded-sm">
      {message}
    </div>
  );
}
