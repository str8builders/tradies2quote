"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowSquareOut,
  ArrowsClockwise,
  Copy,
  DownloadSimple,
  LinkSimple,
  Printer,
  Tray,
} from "@phosphor-icons/react/dist/ssr";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button, ButtonLink, buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SectionTitle } from "@/components/ui/section-title";
import { useToast } from "@/components/ui/toast";
import {
  disableQuoteRequestLink,
  enableQuoteRequestLink,
  rotateQuoteRequestLink,
  type RequestLinkResult,
} from "../request-link-actions";
import { SETTINGS_PATHS } from "./hub";

/** The public link a client opens to ask for a quote. */
export function requestLinkUrl(appUrl: string, slug: string | null): string | null {
  return slug ? `${appUrl.replace(/\/+$/, "")}/r/${slug}` : null;
}

/**
 * "Your request link" and its QR code, on the existing request-link actions:
 * turn on, get a new link (old QR codes stop working), turn off.
 */
export function RequestLinkCard({
  initialSlug,
  appUrl,
  hasBusinessName,
  hasLogo,
}: {
  initialSlug: string | null;
  appUrl: string;
  hasBusinessName: boolean;
  hasLogo: boolean;
}) {
  const toast = useToast();
  const [slug, setSlug] = useState<string | null>(initialSlug);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pending, startTransition] = useTransition();
  const link = requestLinkUrl(appUrl, slug);

  const run = (action: () => Promise<RequestLinkResult>, done: string) => {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          setSlug(result.slug ?? null);
          toast.show(done);
        } else {
          toast.show(result.error, { tone: "bad" });
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
    <Card
      as="section"
      padding="lg"
      id="request-link"
      data-testid="settings-request-link"
      aria-labelledby="request-link-title"
      className="space-y-5"
    >
      <SectionTitle
        id="request-link-title"
        description="Clients tell you about the job in their own words. It lands here as a draft quote for you to check and price."
      >
        Your request link
      </SectionTitle>

      {link && slug ? (
        <>
          <div className="space-y-3">
            <p
              data-testid="request-link-url"
              className="rounded-ui-md border border-ui-line bg-ui-surface-2 px-4 py-3 font-semibold break-all text-ui-text"
            >
              {link}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" icon={<Copy weight="bold" />} onClick={copy} disabled={pending}>
                Copy link
              </Button>
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className={buttonClasses({ variant: "secondary" })}
              >
                <ArrowSquareOut aria-hidden="true" weight="bold" className="text-[1.15em]" />
                <span>Open it</span>
              </a>
            </div>
          </div>

          <div className="flex flex-wrap items-start gap-4">
            {/* A QR code scans only dark on light, so its plate stays white. */}
            {/* eslint-disable-next-line @next/next/no-img-element -- signed-in SVG route, no optimiser */}
            <img
              src={`/api/account/request-qr?v=${encodeURIComponent(slug)}`}
              alt="QR code for your request link"
              width={144}
              height={144}
              style={{ backgroundColor: "white" }}
              className="h-36 w-36 shrink-0 rounded-ui-md border border-ui-line p-1"
            />
            <p className="min-w-0 flex-1 text-ui-sm text-ui-muted">
              Put the QR code on your van, site sign, business cards or counter. Anyone who scans it
              lands on your request page.
            </p>
          </div>

          <div className="space-y-2">
            <ButtonLink
              href="/print/request-poster"
              variant="secondary"
              fullWidth
              icon={<Printer weight="bold" />}
              data-testid="request-poster-link"
            >
              Print a poster
            </ButtonLink>
            <div className="grid grid-cols-2 gap-2">
              <a
                href={`/api/account/request-qr?download=1&format=png&size=1024${hasLogo ? "&logo=1" : ""}`}
                data-testid="request-qr-png"
                className={buttonClasses({ variant: "ghost" })}
              >
                <DownloadSimple aria-hidden="true" weight="bold" className="text-[1.15em]" />
                <span>QR as PNG</span>
              </a>
              <a
                href="/api/account/request-qr?download=1"
                data-testid="request-qr-svg"
                className={buttonClasses({ variant: "ghost" })}
              >
                <DownloadSimple aria-hidden="true" weight="bold" className="text-[1.15em]" />
                <span>QR as SVG</span>
              </a>
            </div>
            <p className="text-ui-sm text-ui-muted">
              PNG for social posts and email, SVG for a sign writer.{" "}
              {hasLogo ? (
                "Your logo sits in the middle of the poster code and the PNG."
              ) : (
                <>
                  <Link href={SETTINGS_PATHS.business} className="font-semibold text-ui-brand-text underline">
                    Add your logo
                  </Link>{" "}
                  and it goes on the poster and in the middle of the code.
                </>
              )}
            </p>
          </div>

          <div className="space-y-2 border-t border-ui-line pt-4">
            <ButtonLink href="/app/requests" variant="ghost" fullWidth icon={<Tray weight="bold" />}>
              See requests
            </ButtonLink>
            <Button
              variant="ghost"
              fullWidth
              icon={<ArrowsClockwise weight="bold" />}
              onClick={() => setConfirmReset(true)}
              disabled={pending}
              data-testid="request-link-reset"
            >
              Get a new link
            </Button>
            <Button
              variant="ghost"
              fullWidth
              onClick={() => run(disableQuoteRequestLink, "Request link turned off")}
              disabled={pending}
              data-testid="request-link-off"
            >
              Turn the link off
            </Button>
          </div>

          <BottomSheet
            open={confirmReset}
            onClose={() => setConfirmReset(false)}
            title="Get a new link?"
            description="Your old link and QR codes stop working. Reprint anything you've shared."
            footer={
              <div className="flex flex-col gap-2">
                <Button
                  variant="danger"
                  fullWidth
                  loading={pending}
                  loadingLabel="Getting a new link…"
                  onClick={() => {
                    setConfirmReset(false);
                    run(rotateQuoteRequestLink, "New link ready. Reprint your QR codes.");
                  }}
                >
                  Get a new link
                </Button>
                <Button variant="ghost" fullWidth onClick={() => setConfirmReset(false)}>
                  Keep this link
                </Button>
              </div>
            }
          />
        </>
      ) : (
        <div className="space-y-2">
          <Button
            variant="secondary"
            fullWidth
            icon={<LinkSimple weight="bold" />}
            loading={pending}
            loadingLabel="Setting it up…"
            onClick={() => run(enableQuoteRequestLink, "Your request link is on")}
            disabled={!hasBusinessName}
            data-testid="request-link-enable"
          >
            Turn on my request link
          </Button>
          {!hasBusinessName ? (
            <p className="text-ui-sm text-ui-muted">
              <Link href={SETTINGS_PATHS.business} className="font-semibold text-ui-brand-text underline">
                Add your business name
              </Link>{" "}
              first. It becomes your link.
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}
