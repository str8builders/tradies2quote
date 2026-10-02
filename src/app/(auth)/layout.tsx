import { cookies } from "next/headers";
import { TEXT_SIZE_COOKIE, parseTextSizeValue, textSizeAttributeValue } from "@/lib/ui/text-size";

/**
 * Auth route-group layout. Each page (`/login`, `/signup`,
 * `/forgot-password`, `/reset-password`) owns its own visual chrome.
 *
 * The earlier version of this file rendered a header + `max-w-md` shell
 * using semantic tokens (`bg-surface`, `border-border`, …) that aren't
 * declared in our Tailwind v4 `@theme` block, so the header rendered
 * unstyled in production. The split-screen login/signup shells are
 * full-bleed; the simpler forgot/reset-password pages center themselves
 * via the wrapper they already render. Centralising chrome here would
 * fight both layouts.
 *
 * The one thing it does carry is the per-device Text size (the t2q-text
 * cookie, src/lib/ui/text-size.ts): data-text on this wrapper makes every
 * size inside it Large or Extra large, and data-contrast-root lets the
 * <TextSizeControl> on these pages find it.
 */
export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const textSize = parseTextSizeValue((await cookies()).get(TEXT_SIZE_COOKIE)?.value);
  return (
    <div
      className="studio-public studio-auth-pages"
      data-contrast-root=""
      data-text={textSizeAttributeValue(textSize)}
    >
      {children}
    </div>
  );
}
