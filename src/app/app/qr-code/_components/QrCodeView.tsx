"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowSquareOut,
  CaretRight,
  Copy,
  DownloadSimple,
  GearSix,
  LinkSimple,
  Printer,
  Tray,
  Truck,
} from "@phosphor-icons/react/dist/ssr";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { cx } from "@/components/ui/cx";
import { IconTile } from "@/components/ui/icon-tile";
import { SectionTitle } from "@/components/ui/section-title";
import { TAP } from "@/components/ui/styles";
import { useToast } from "@/components/ui/toast";
import type { IconTone } from "@/components/ui/styles";
import { enableQuoteRequestLink } from "../../settings/request-link-actions";
import { SETTINGS_PATHS } from "../../settings/_newlook/hub";
import { requestLinkUrl } from "../../settings/_newlook/RequestLinkCard";
import { POSTER_PATH, QR_GUIDE, STICKER_HREF } from "../_lib/guide";
import { ShareQrButton } from "./ShareQrButton";

/** The link in words, allowed to wrap after each slash rather than mid-name. */
function LinkWords({ link }: { link: string }) {
  const parts = link.replace(/^https?:\/\//, "").split("/");
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 ? (
            <>
              /<wbr />
            </>
          ) : null}
        </span>
      ))}
    </>
  );
}

export const QR_INTRO =
  "Put it on your van, your site sign or your counter. Anyone who scans it can tell you about their job, and it lands in the app as a draft quote.";

function PrintOption({
  href,
  icon,
  tone,
  title,
  children,
  testId,
}: {
  href: string;
  icon: ReactNode;
  tone: IconTone;
  title: string;
  children: ReactNode;
  testId: string;
}) {
  return (
    <li>
      <a
        href={href}
        data-testid={testId}
        className={cx(
          "ui-focus-ring flex min-h-16 items-center gap-3 rounded-ui-lg border border-ui-line bg-ui-surface p-4 text-ui-text no-underline shadow-ui-card hover:bg-ui-surface-2",
          TAP,
        )}
      >
        <IconTile icon={icon} tone={tone} />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{title}</span>
          <span className="block text-ui-sm text-ui-muted">{children}</span>
        </span>
        <CaretRight aria-hidden="true" weight="bold" className="shrink-0 text-[1.25rem] text-ui-faint" />
      </a>
    </li>
  );
}

/** "How to use it": print, stick, size, test, then the requests come in. */
export function QrGuide() {
  return (
    <section aria-labelledby="qr-guide-title" data-testid="qr-guide">
      <SectionTitle id="qr-guide-title">How to use it</SectionTitle>
      <ol className="mt-3 space-y-3">
        {QR_GUIDE.map((step, i) => (
          <li key={step.id} className="flex gap-3" data-step={step.id}>
            <span
              aria-hidden="true"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ui-brand-soft font-semibold text-ui-brand-text"
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1 pt-1">
              <span className="block font-semibold text-ui-text">{step.title}</span>
              <span className="mt-1 block text-ui-sm text-ui-muted">{step.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Your QR code (new look). With the request link on: the code on a white
 * plate (a QR code scans only dark on light), the link, the print options
 * and the guide. In the iPhone app a web page can't print or download, so
 * the code goes to the share sheet instead (Print, Save Image, AirDrop).
 * With the link off: turn it on (it's made from the business name).
 */
export function QrCodeView({
  initialSlug,
  appUrl,
  hasBusinessName,
  hasLogo,
  inApp,
}: {
  initialSlug: string | null;
  appUrl: string;
  hasBusinessName: boolean;
  hasLogo: boolean;
  inApp: boolean;
}) {
  const toast = useToast();
  const [slug, setSlug] = useState<string | null>(initialSlug);
  const [pending, startTransition] = useTransition();
  const link = requestLinkUrl(appUrl, slug);
  const pngHref = `/api/account/request-qr?format=png&size=1024${hasLogo ? "&logo=1" : ""}`;

  const turnOn = () => {
    startTransition(async () => {
      try {
        const result = await enableQuoteRequestLink();
        if (result.ok && result.slug) {
          setSlug(result.slug);
          toast.show("Your QR code is ready");
        } else {
          toast.show(result.ok ? "That didn't work. Try again." : result.error, { tone: "bad" });
        }
      } catch {
        toast.show("That didn't work. Check your signal and try again.", { tone: "bad" });
      }
    });
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      toast.show("Link copied");
    } catch {
      toast.show("Couldn't copy it. Press and hold the link to copy it.", { tone: "bad" });
    }
  };

  return (
    <div className="mx-auto w-full max-w-xl flex-1 space-y-6 px-4 pt-5 pb-10" data-testid="qr-code-body">
      <p className="text-ui-base text-ui-muted">{QR_INTRO}</p>

      {link && slug ? (
        <>
          <Card as="section" padding="lg" aria-label="Your QR code" className="space-y-4" data-testid="qr-code-card">
            {/* A QR code scans only dark on light, so its plate stays white. */}
            <div style={{ backgroundColor: "white" }} className="mx-auto w-full max-w-72 rounded-ui-lg p-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- signed-in SVG route, no optimiser */}
              <img
                src={`/api/account/request-qr?v=${encodeURIComponent(slug)}`}
                alt="QR code for your request link"
                width={288}
                height={288}
                className="block aspect-square h-auto w-full"
                data-testid="qr-code-image"
              />
            </div>
            <p className="text-center text-ui-sm text-ui-muted">
              Show this to a client and they can scan it straight off your phone.
            </p>
            <p
              data-testid="qr-code-link"
              className="rounded-ui-md border border-ui-line bg-ui-surface-2 px-4 py-3 text-center font-semibold break-words text-ui-text"
            >
              <LinkWords link={link} />
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" icon={<Copy weight="bold" />} onClick={copy}>
                Copy link
              </Button>
              <a href={link} target="_blank" rel="noreferrer" className={buttonClasses({ variant: "secondary" })}>
                <ArrowSquareOut aria-hidden="true" weight="bold" className="text-[1.15em]" />
                <span>Open it</span>
              </a>
            </div>
          </Card>

          <section aria-labelledby="qr-print-title" className="space-y-3" data-testid="qr-print">
            <SectionTitle
              id="qr-print-title"
              description={
                inApp
                  ? "Send the code to yourself or your sign-writer, or print it from the share sheet."
                  : "Print it at home, or give the file to a sign-writer."
              }
            >
              Print it
            </SectionTitle>
            {inApp ? (
              <>
                <ShareQrButton href={pngHref} />
                <p className="text-ui-sm text-ui-muted" data-testid="qr-print-in-app">
                  The van sticker sheet and the poster print from a computer or your phone&apos;s browser: sign in at
                  tradies2quote.com and open Your QR code.
                </p>
              </>
            ) : (
              <>
                <ul className="grid gap-3">
                  <PrintOption
                    href={STICKER_HREF}
                    icon={<Truck weight="duotone" />}
                    tone="brand"
                    title="Van or car sticker"
                    testId="qr-print-sticker"
                  >
                    One big code for the side of the van or the tailgate, or four small ones for car windows and
                    toolboxes.
                  </PrintOption>
                  <PrintOption
                    href={POSTER_PATH}
                    icon={<Printer weight="duotone" />}
                    tone="info"
                    title="A4 poster"
                    testId="qr-print-poster"
                  >
                    For the site fence, the shop counter or the office window.
                  </PrintOption>
                </ul>
                <div className="grid grid-cols-2 gap-2">
                  <a href={`${pngHref}&download=1`} data-testid="qr-download-png" className={buttonClasses({ variant: "ghost" })}>
                    <DownloadSimple aria-hidden="true" weight="bold" className="text-[1.15em]" />
                    <span>QR as PNG</span>
                  </a>
                  <a href="/api/account/request-qr?download=1" data-testid="qr-download-svg" className={buttonClasses({ variant: "ghost" })}>
                    <DownloadSimple aria-hidden="true" weight="bold" className="text-[1.15em]" />
                    <span>QR as SVG</span>
                  </a>
                </div>
                <p className="text-ui-sm text-ui-muted">
                  The SVG stays sharp at any size, so a sign-writer can cut a proper vinyl decal from it.
                </p>
              </>
            )}
            {!hasLogo ? (
              <p className="text-ui-sm text-ui-muted">
                <Link href={SETTINGS_PATHS.business} className="font-semibold text-ui-brand-text underline">
                  Add your logo
                </Link>{" "}
                and it sits in the middle of the printed code.
              </p>
            ) : null}
          </section>

          <QrGuide />

          <Callout tone="warn" title="Keep this link">
            Your stickers keep working as long as the link stays the same. Getting a new link in Rates and quotes stops
            the old ones.
          </Callout>

          <div className="space-y-2 border-t border-ui-line pt-4">
            <ButtonLink href="/app/requests" variant="secondary" fullWidth icon={<Tray weight="bold" />}>
              See requests
            </ButtonLink>
            <ButtonLink
              href={`${SETTINGS_PATHS.rates}#request-link`}
              variant="ghost"
              fullWidth
              icon={<GearSix weight="bold" />}
              data-testid="qr-link-settings"
            >
              Link settings
            </ButtonLink>
          </div>
        </>
      ) : (
        <>
          <Card as="section" padding="lg" aria-labelledby="qr-off-title" className="space-y-4" data-testid="qr-code-off">
            <SectionTitle
              id="qr-off-title"
              description="Your QR code opens your own request page. Turn it on and it's ready to print."
            >
              Get your QR code
            </SectionTitle>
            <Button
              fullWidth
              icon={<LinkSimple weight="bold" />}
              loading={pending}
              loadingLabel="Setting it up…"
              onClick={turnOn}
              disabled={!hasBusinessName}
              data-testid="qr-code-enable"
            >
              Turn on my QR code
            </Button>
            {!hasBusinessName ? (
              <p className="text-ui-sm text-ui-muted">
                <Link href={SETTINGS_PATHS.business} className="font-semibold text-ui-brand-text underline">
                  Add your business name
                </Link>{" "}
                first. It becomes your link.
              </p>
            ) : null}
          </Card>
          <QrGuide />
        </>
      )}
    </div>
  );
}
