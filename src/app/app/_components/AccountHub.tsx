"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Pulse,
  Briefcase,
  Bug,
  Calculator,
  Camera,
  ChatCircleDots,
  CloudSun,
  GearSix,
  Lifebuoy,
  Receipt,
  Robot,
  SignOut,
  Stack,
  Trash,
  UserCircle,
  UsersThree,
  X,
} from "@phosphor-icons/react";
import {
  removeAvatarAction,
  uploadAvatarAction,
  type AvatarActionResult,
} from "./account-hub-actions";
import { prepareAvatarImage } from "@/lib/imagePrep";
import { isWeatherImpactEnabled } from "@/lib/weather-impact/feature-flag";
import { PushToggle } from "./PushToggle";

/**
 * Shared body of the account hub.
 *
 * One source of truth, two presentations:
 *   - On mobile, `<MobileAppMenuClient>` mounts this inside a
 *     slide-up sheet (rendered with `mode="sheet"`).
 *   - On desktop, `<AppHeaderClient>` mounts this inside a dropdown
 *     panel anchored to the avatar trigger (`mode="panel"`).
 *
 * Why these item groups (per spec):
 *   - Profile / Business / Quote defaults / Invoice defaults all live
 *     on the existing /app/settings route — clicking each scrolls /
 *     anchors to the relevant section (see SettingsForm anchors).
 *     Putting them in the hub gives the user mental separation
 *     without us having to fragment the settings page.
 *   - Clients link goes to the existing /app/clients route.
 *   - Avatar photo: the upload UI is wired (see <AvatarUploadField>)
 *     but disabled-with-explainer until the `profiles.avatar_url`
 *     migration ships. Initials fallback is the current state.
 *   - Owner-only group renders only when `isOwner === true`. Items
 *     are: Agents (/app/agents), Debug (/app/debug), Monitor (the
 *     external 685agents dashboard).
 *
 * Hard rules preserved:
 *   - `/app/agents` and `/app/debug` server pages still gate by
 *     `isOwnerEmail()` — these links are merely conveniences.
 *   - Non-owner tradies never see those links.
 *   - This component is a client component but does NOT import the
 *     server-only agent-monitor logger.
 */
export interface AccountHubProps {
  isOwner: boolean;
  userEmail: string | null;
  avatarUrl: string | null;
  /** "sheet" = full-width mobile slide-up. "panel" = compact desktop
   *  dropdown card. The two share every item; only the chrome
   *  differs. */
  mode: "sheet" | "panel";
  /** Called when the hub wants to close (X button, link click, outside
   *  click). The parent owns open/closed state. */
  onClose: () => void;
}

interface HubLink {
  href: string;
  label: string;
  caption: string;
  Icon: React.ComponentType<{ size?: number; weight?: "bold" | "regular" | "fill"; className?: string }>;
  /** Optional hash so we can jump straight to a settings section. */
  hash?: string;
  /** Owner-only items are filtered out for non-owners. */
  ownerOnly?: boolean;
}

const PRIMARY_ITEMS: ReadonlyArray<HubLink> = [
  { href: "/app/team", label: "Your team", caption: "People, invitations & shared clients", Icon: UsersThree },
  { href: "/app/templates", label: "Terms templates", caption: "Reusable wording for Builder teams", Icon: Receipt },
  {
    href: "/app/settings",
    hash: "profile",
    label: "Profile",
    caption: "Name, email, phone",
    Icon: UserCircle,
  },
  {
    href: "/app/settings",
    hash: "business",
    label: "Business settings",
    caption: "Trading name, address, GST",
    Icon: Briefcase,
  },
  {
    href: "/app/settings",
    hash: "defaults",
    label: "Quote defaults",
    caption: "Labour, markup, currency",
    Icon: GearSix,
  },
  {
    href: "/app/settings",
    hash: "payment_instructions",
    label: "Payment details",
    caption: "Bank account & payment instructions",
    Icon: Receipt,
  },
  {
    href: "/app/materials",
    label: "Materials",
    caption: "Your price library",
    Icon: Stack,
  },
  {
    // Mobile-parity fix: /app/weather was reachable only from the
    // desktop-only header tabs — this is the one mobile entry point.
    href: "/app/weather",
    label: "Weather",
    caption: "Safe / caution / unsafe for the job site",
    Icon: CloudSun,
  },
  {
    href: "/app/clients",
    label: "Clients",
    caption: "Saved contacts",
    Icon: UsersThree,
  },
  {
    // T2QCAL opens inside the installed app (same site scope); this is the
    // mobile entry point since the bottom bar has no room for a fifth tab.
    href: "/t2qcal/calculators",
    label: "Calculators (T2QCAL)",
    caption: "Rafters, stairs, concrete, spacing and 90 more",
    Icon: Calculator,
  },
  {
    href: "/app/beta",
    label: "Send feedback",
    caption: "Tell us what to fix",
    Icon: ChatCircleDots,
  },
  {
    href: "/help",
    label: "Help & FAQ",
    caption: "How things work + email support",
    Icon: Lifebuoy,
  },
];

/* Owner-only shortcuts (Wave 13 + Wave 15). These are visually grouped
   in their own section so non-owners never see a half-empty list. */
const OWNER_ITEMS: ReadonlyArray<HubLink> = [
  {
    href: "/app/agents",
    label: "Agents",
    caption: "Wave 12 agent panel",
    Icon: Robot,
    ownerOnly: true,
  },
  {
    href: "/app/debug",
    label: "Debug",
    caption: "Owner-only diagnostics",
    Icon: Bug,
    ownerOnly: true,
  },
  {
    href: "/app/agents/monitor",
    label: "Agent monitor",
    caption: "Live runs + events + T2Q triage",
    Icon: Pulse,
    ownerOnly: true,
  },
];

export function AccountHub({
  isOwner,
  userEmail,
  avatarUrl,
  mode,
  onClose,
}: AccountHubProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const closeButton = dialog.querySelector<HTMLButtonElement>('[aria-label="Close account hub"]');
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButton?.focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeRef.current(); }
      if (event.key !== "Tab" || mode !== "sheet") return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]'))
        .filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus({ preventScroll: true }); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus({ preventScroll: true }); }
    };
    dialog.addEventListener("keydown", keydown);
    return () => {
      dialog.removeEventListener("keydown", keydown);
      // Do not steal focus from a destination page after link navigation.
      if (document.activeElement === document.body || dialog.contains(document.activeElement)) previousFocus?.focus({ preventScroll: true });
    };
  }, [mode]);
  const initial =
    (userEmail ?? "?").trim().charAt(0).toUpperCase() || "?";
  // Flag-parked features vanish from the hub — a visible row must never
  // open a locked "owner testing" screen (App Store Guideline 2.1).
  const items = PRIMARY_ITEMS.filter(
    (it) => it.href !== "/app/weather" || isWeatherImpactEnabled(isOwner),
  );
  const ownerItems = isOwner ? OWNER_ITEMS : [];

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal={mode === "sheet" ? true : undefined}
      aria-labelledby="account-hub-heading"
      data-testid="account-hub"
      data-mode={mode}
      data-is-owner={isOwner ? "true" : "false"}
      className="t2q-account-hub"
    >
      <header className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <AccountAvatar
            avatarUrl={avatarUrl}
            initial={initial}
            size={mode === "sheet" ? 40 : 36}
          />
          <div className="min-w-0">
            <p
              id="account-hub-heading"
              className="font-display text-sm uppercase tracking-tight text-white"
            >
              Account
            </p>
            <p className="truncate text-xs text-ink-300">
              {userEmail ?? "—"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close account hub"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 text-ink-300 hover:border-brand hover:text-brand"
        >
          <X size={14} weight="bold" />
        </button>
      </header>

      {/* Avatar photo section. Disabled-with-explainer until the
          `profiles.avatar_url` migration lands; see plan notes. */}
      <AvatarUploadField avatarUrl={avatarUrl} initial={initial} />

      <p className="mt-4 mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-400">
        {"// account"}
      </p>
      <ul className="space-y-2">
        {items.map((it) => (
          <HubLinkRow key={`${it.href}${it.hash ?? ""}`} item={it} onClose={onClose} />
        ))}
      </ul>

      <p className="mt-5 mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-400">
        {"// notifications"}
      </p>
      <PushToggle />

      {ownerItems.length > 0 ? (
        <>
          <p
            data-testid="account-hub-owner-section"
            className="mt-5 mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-brand"
          >
            {"// owner only"}
          </p>
          <ul className="space-y-2">
            {ownerItems.map((it) => (
              <HubLinkRow
                key={`${it.href}${it.hash ?? ""}`}
                item={it}
                onClose={onClose}
              />
            ))}
          </ul>
        </>
      ) : null}

      <form action="/auth/signout" method="POST" className="mt-5">
        {/* Solid destructive colours so the button reads clearly in
            both themes. The earlier red-200 on red-500/5 (5% opacity)
            rendered as ghost-pink on the cream light-mode card and
            looked disabled. */}
        <button
          type="submit"
          data-testid="account-hub-sign-out"
          className="flex w-full items-center gap-3 rounded-sm border border-red-600 bg-red-600 px-4 py-3 text-left text-white shadow-sm hover:bg-red-700 hover:border-red-700"
        >
          <SignOut
            size={16}
            weight="bold"
            className="text-white"
            aria-hidden="true"
          />
          <span className="font-display text-sm uppercase tracking-tight text-white">
            Sign out
          </span>
        </button>
      </form>
    </div>
  );
}

function HubLinkRow({
  item,
  onClose,
}: {
  item: HubLink;
  onClose: () => void;
}) {
  const { href, hash, label, caption, Icon } = item;
  const fullHref = hash ? `${href}#${hash}` : href;
  // Use a real anchor for external (Monitor) links so they open in a
  // new tab and don't blow up Next's client-side router.
  const isExternal = /^https?:\/\//.test(href);
  const cls =
    "t2q-account-link";
  const content = (
    <>
      <Icon
        size={16}
        weight="bold"
        className="text-brand"
        aria-hidden="true"
      />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-white">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-300">{caption}</span>
      </span>
    </>
  );
  return (
    <li>
      {isExternal ? (
        <a
          href={fullHref}
          target="_blank"
          rel="noreferrer noopener"
          data-testid={`account-hub-${label.toLowerCase().replace(/\s+/g, "-")}`}
          onClick={onClose}
          className={cls}
        >
          {content}
        </a>
      ) : (
        <Link
          href={fullHref}
          // Wave 15.4 — prefetch every hub item so tapping any of
          // Profile / Business / Quote defaults / Invoice defaults /
          // Clients / Agents / Debug navigates instantly. Next 16's
          // default null only warms loading.tsx + the first segment.
          prefetch={true}
          data-testid={`account-hub-${label.toLowerCase().replace(/\s+/g, "-")}`}
          onClick={onClose}
          className={cls}
        >
          {content}
        </Link>
      )}
    </li>
  );
}

/* ------------------------------------------------------------------
 * Avatar field — live upload + remove.
 *
 * Wave 14.7 — wired to the `profile-avatars` storage bucket and the
 * `profiles.avatar_url` column. Validation runs both in the browser
 * (instant feedback) and in the server action (authoritative + RLS-
 * gated). The storage bucket also enforces the same mime allow-list
 * + 2 MB limit, so a malformed call gets rejected at three layers.
 *
 * UX:
 *   1. User taps "Upload" → file picker opens (jpg/png/webp).
 *   2. On change, we submit the file straight away with the upload
 *      server action — no separate "save" button.
 *   3. While the action is pending, the button shows "Saving…" and
 *      both buttons are disabled.
 *   4. On success: router.refresh() repaints headers + sheet from
 *      the revalidated server tree (the action also calls
 *      revalidatePath("/app","layout") for safety).
 *   5. On error: an inline message appears below the row and the
 *      existing avatar (or initials) stays.
 * ------------------------------------------------------------------ */
function AccountAvatar({
  avatarUrl,
  initial,
  size,
}: {
  avatarUrl: string | null;
  initial: string;
  size: number;
}) {
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        width={size}
        height={size}
        style={{ width: size, height: size }}
        className="shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size }}
      className="t2q-profile-initial t2q-profile-initial-badge shrink-0"
    >
      {initial}
    </span>
  );
}

// Broad client-side accept so the iOS Photos picker lets the user pick —
// INCLUDING HEIC, which we now convert to JPEG client-side before upload
// (see prepareAvatarImage). The server action still re-validates the
// resulting mime + extension.
const CLIENT_ACCEPT =
  "image/jpeg,image/png,image/webp,image/jpg,image/heic,image/heif,.heic,.heif";
const SAFE_EXT_RE = /\.(jpe?g|png|webp|hei[cf])$/i;

function isLikelyImage(file: File): boolean {
  // Some mobile browsers (notably older iOS Safari) hand back an empty
  // file.type. Fall back to the filename's extension so we don't fail
  // a perfectly valid pick.
  if (/^image\/(jpe?g|png|webp|hei[cf])$/i.test(file.type)) return true;
  if (!file.type) return SAFE_EXT_RE.test(file.name);
  return false;
}

function AvatarUploadField({
  avatarUrl,
  initial,
}: {
  avatarUrl: string | null;
  initial: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleResult = (res: AvatarActionResult) => {
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setError(null);
    router.refresh();
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    // Clear the input value immediately so picking the same file again
    // re-fires onChange. (Browsers suppress duplicate change events.)
    if (e.target) e.target.value = "";
    if (!file) return;
    if (!isLikelyImage(file)) {
      setError("Use a JPG, PNG, or WebP image.");
      return;
    }
    // Compress client-side first: converts an iPhone HEIC to JPEG and
    // downscales any phone photo to ~512 px, so the old "FILE IS OVER 2 MB"
    // rejection can't happen. Falls back to the original on any failure —
    // the server action re-validates format + size regardless.
    startTransition(async () => {
      let prepared = file;
      try {
        prepared = await prepareAvatarImage(file);
      } catch {
        /* keep the original; server validation is authoritative */
      }
      const fd = new FormData();
      fd.append("avatar", prepared);
      try {
        const res = await uploadAvatarAction(fd);
        handleResult(res);
      } catch {
        // A thrown action (network drop, or a platform 413 on a pathological
        // file) would otherwise be a silent unhandled rejection.
        setError("Upload failed — try a smaller image or check your connection.");
      }
    });
  };

  const onRemove = () => {
    setError(null);
    startTransition(async () => {
      const res = await removeAvatarAction();
      handleResult(res);
    });
  };

  return (
    <div
      data-testid="account-hub-avatar-field"
      className="flex flex-col gap-2 rounded-sm border border-dashed border-ink-700 bg-ink-900/40 p-3"
    >
      <div className="flex items-center gap-3">
        <AccountAvatar avatarUrl={avatarUrl} initial={initial} size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-white">Profile photo</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-300">
            {avatarUrl ? "Your personal touch" : "Make it yours"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {avatarUrl ? (
            <button
              type="button"
              onClick={onRemove}
              disabled={pending}
              data-testid="account-hub-avatar-remove"
              className="inline-flex items-center gap-1.5 rounded-sm border border-ink-700 bg-ink-900/60 px-2.5 py-2 text-[11px] font-display uppercase tracking-tight text-ink-300 hover:border-red-500/60 hover:text-red-200 disabled:opacity-60"
            >
              <Trash size={12} weight="bold" aria-hidden="true" />
              Remove
            </button>
          ) : null}
          {/* Wave 15.4 — REAL upload fix.
              Wave 15.3 used `<label htmlFor>` pointing at a separate
              sr-only input. iOS Safari treats `clip:rect(0,0,0,0)` +
              1×1px inputs as too hidden to trigger the file picker,
              even via a native label association. The fix is to keep
              the file input in the DOM AND in layout, positioned
              absolute over the visible button content with opacity 0
              — taps land on the actual input element, which is what
              iOS's picker heuristic requires. */}
          <label
            aria-disabled={pending}
            data-testid="account-hub-avatar-upload"
            className={`relative inline-flex items-center gap-2 overflow-hidden rounded-sm border border-ink-700 bg-ink-900/60 px-3 py-2 text-xs font-display uppercase tracking-tight text-white hover:border-brand hover:text-brand ${
              pending ? "pointer-events-none opacity-60" : "cursor-pointer"
            }`}
          >
            <Camera size={13} weight="bold" aria-hidden="true" />
            <span>
              {pending ? "Saving…" : avatarUrl ? "Change" : "Upload"}
            </span>
            <input
              type="file"
              accept={CLIENT_ACCEPT}
              onChange={onPick}
              disabled={pending}
              data-testid="account-hub-avatar-input"
              // Fills the label box; opacity:0 keeps it invisible but
              // taps go straight to the input → iOS opens the picker.
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        </div>
      </div>
      {error ? (
        <p
          role="alert"
          data-testid="account-hub-avatar-error"
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-red-300"
        >
          {error}
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-ink-300">
          JPG, PNG, WebP or HEIC. We’ll size your photo to fit.
        </p>
      )}
    </div>
  );
}
