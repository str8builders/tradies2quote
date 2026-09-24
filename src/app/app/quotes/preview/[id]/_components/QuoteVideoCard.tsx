"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  ArrowClockwise,
  CircleNotch,
  DownloadSimple,
  Info,
  ShareNetwork,
  VideoCamera,
  Warning,
} from "@phosphor-icons/react";
import { isNativeIOSApp } from "@/lib/native-app";
import { QUOTE_VIDEO_POLL, shouldKeepPolling, type QuoteVideoStatus } from "@/lib/quote-video/status";
import { getQuoteVideoStatusAction, requestQuoteVideoAction } from "../video-actions";

/**
 * "Quote video" card on the owner's quote page: make a 15-second video of the
 * quote, wait while the server renders it, then share the MP4 through the
 * phone's share sheet (WhatsApp, Messenger, Messages…) or download it. The
 * same video plays at the top of the client's quote link while it matches
 * the quote's current version.
 *
 * Big buttons for one-handed use: the main action is 56 px tall, the rest at
 * least 48 px.
 */

export type ShareState = "idle" | "preparing" | "again" | "error";

export type QuoteVideoCardViewProps = {
  status: QuoteVideoStatus;
  /** A request is on its way to the server. */
  requesting: boolean;
  /** Polled for five minutes without an answer. */
  slow: boolean;
  error: string | null;
  /** The browser (or the iOS app) can hand an MP4 to the share sheet. */
  canShareFiles: boolean;
  shareState: ShareState;
  /** Same-origin URL of the MP4 (owner-only route). */
  fileHref: string;
  onRequest(): void;
  onCheckAgain(): void;
  onShare(): void;
  onPreviewError?(): void;
};

const PRIMARY =
  "t2q-btn-primary-pro inline-flex min-h-[56px] w-full items-center justify-center gap-2 px-6 text-base disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";
const SECONDARY =
  "t2q-btn-ghost-pro inline-flex min-h-[48px] w-full items-center justify-center gap-2 px-5 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";

function MakeButton({ label, requesting, onRequest }: { label: string; requesting: boolean; onRequest(): void }) {
  return (
    <button type="button" data-testid="quote-video-make" onClick={onRequest} disabled={requesting} className={PRIMARY}>
      {requesting ? <CircleNotch size={20} weight="bold" className="animate-spin" /> : <VideoCamera size={20} weight="bold" />}
      {requesting ? "Starting…" : label}
    </button>
  );
}

export function QuoteVideoCardView(props: QuoteVideoCardViewProps) {
  const { status, requesting, slow, error, canShareFiles, shareState, fileHref } = props;
  return (
    <section
      id="quote-video"
      data-testid="quote-video-card"
      data-state={status.kind}
      aria-labelledby="quote-video-heading"
      className="t2q-card-pro mt-6 p-5 sm:p-6"
    >
      <div className="flex items-center gap-2">
        <VideoCamera size={16} weight="bold" className="text-brand" />
        <span className="t2q-section-label-pro">{"// quote video"}</span>
      </div>
      <h2 id="quote-video-heading" className="mt-3 font-display text-2xl uppercase tracking-tight text-white">
        Quote video
      </h2>

      {status.kind === "none" ? (
        <>
          <p className="mt-2 text-sm text-ink-200 sm:text-base">
            Turn this quote into a 15-second video your client can watch on their phone.
          </p>
          <div className="mt-5">
            <MakeButton label="Make a quote video" requesting={requesting} onRequest={props.onRequest} />
          </div>
        </>
      ) : null}

      {status.kind === "working" && !slow ? (
        <div data-testid="quote-video-working" role="status" className="mt-4 flex items-start gap-3">
          <CircleNotch size={28} weight="bold" className="mt-0.5 shrink-0 animate-spin text-brand" />
          <div>
            <p className="text-base font-semibold text-white">Making your video… usually under a minute.</p>
            <p className="mt-1 text-sm text-ink-300">You can leave this page. It keeps going.</p>
          </div>
        </div>
      ) : null}

      {status.kind === "working" && slow ? (
        <>
          <p data-testid="quote-video-slow" role="status" className="mt-4 text-base text-ink-100">
            This is taking longer than usual. It will keep going, so check back in a few minutes.
          </p>
          <div className="mt-5">
            <button type="button" data-testid="quote-video-check-again" onClick={props.onCheckAgain} className={SECONDARY}>
              <ArrowClockwise size={18} weight="bold" />
              Check again
            </button>
          </div>
        </>
      ) : null}

      {status.kind === "ready" ? (
        <>
          <video
            data-testid="quote-video-preview"
            className="mt-4 aspect-[9/16] w-full max-w-[280px] rounded-xl border border-ink-700 bg-ink-950 object-cover"
            src={status.videoUrl}
            poster={status.posterUrl}
            controls
            playsInline
            preload="none"
            aria-label="Quote video preview"
            onError={props.onPreviewError}
          />
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
            {canShareFiles ? (
              <button
                type="button"
                data-testid="quote-video-share"
                onClick={props.onShare}
                disabled={shareState === "preparing"}
                className={PRIMARY}
              >
                {shareState === "preparing" ? (
                  <CircleNotch size={20} weight="bold" className="animate-spin" />
                ) : (
                  <ShareNetwork size={20} weight="bold" />
                )}
                {shareState === "preparing" ? "Getting the video ready…" : "Share video"}
              </button>
            ) : (
              <a data-testid="quote-video-download" href={fileHref} download={status.fileName} className={PRIMARY}>
                <DownloadSimple size={20} weight="bold" />
                Download video
              </a>
            )}
          </div>
          {shareState === "again" ? (
            <p data-testid="quote-video-share-again" role="status" className="mt-3 text-sm text-ink-100">
              The video is ready. Tap Share video again.
            </p>
          ) : null}
          {shareState === "error" ? (
            <p data-testid="quote-video-share-error" role="alert" className="mt-3 text-sm text-red-300">
              The video couldn&apos;t be shared.{" "}
              <a href={fileHref} download={status.fileName} className="inline-flex min-h-[48px] items-center font-semibold text-brand underline">
                Download it instead
              </a>
            </p>
          ) : null}
          <p className="mt-4 inline-flex items-start gap-2 text-sm text-ink-300">
            <Info size={16} weight="bold" className="mt-0.5 shrink-0" />
            It also plays at the top of your client&apos;s quote link.
          </p>
        </>
      ) : null}

      {status.kind === "stale" ? (
        <>
          <p data-testid="quote-video-stale" className="mt-2 inline-flex items-start gap-2 text-sm text-ink-100 sm:text-base">
            <Warning size={18} weight="bold" className="mt-0.5 shrink-0 text-hivis" />
            {status.hadVideo
              ? "You've changed this quote since the video was made, so it no longer matches. Your client won't see the old one."
              : "You've changed this quote since you asked for a video."}
          </p>
          <div className="mt-5">
            <MakeButton label="Make a new video" requesting={requesting} onRequest={props.onRequest} />
          </div>
        </>
      ) : null}

      {status.kind === "failed" ? (
        <>
          <p data-testid="quote-video-failed" className="mt-2 text-sm text-ink-100 sm:text-base">
            Sorry, we couldn&apos;t make the video this time.
          </p>
          <div className="mt-5">
            <MakeButton label="Try again" requesting={requesting} onRequest={props.onRequest} />
          </div>
        </>
      ) : null}

      {error ? (
        <p
          data-testid="quote-video-error"
          role="alert"
          className="mt-4 rounded-sm border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300"
        >
          {error}
        </p>
      ) : null}
    </section>
  );
}

/* ─── Share support ───────────────────────────────────────────────────────── */

let fileShareSupport: boolean | null = null;

/** Whether an MP4 can go to the share sheet: the iOS app always, browsers when navigator.canShare says so. */
export function canShareVideoFiles(): boolean {
  if (typeof window === "undefined") return false;
  if (fileShareSupport !== null) return fileShareSupport;
  try {
    const probe = new File([new Uint8Array([0])], "quote-video.mp4", { type: "video/mp4" });
    fileShareSupport =
      isNativeIOSApp() || (typeof navigator.canShare === "function" && navigator.canShare({ files: [probe] }));
  } catch {
    fileShareSupport = false;
  }
  return fileShareSupport;
}

const noSubscription = () => () => {};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] ?? "");
    reader.readAsDataURL(blob);
  });
}

/** iOS app: navigator.share({ files }) is a no-op in WKWebView, so bridge to the native sheet (as SavePdfButton does). */
async function shareInNativeApp(file: File, text: string | undefined): Promise<void> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import("@capacitor/filesystem"),
    import("@capacitor/share"),
  ]);
  const written = await Filesystem.writeFile({ path: file.name, data: await blobToBase64(file), directory: Directory.Cache });
  try {
    await Share.share({ title: "Your quote video", url: written.uri, ...(text ? { text } : {}) });
  } catch {
    // Sheet closed without sharing: not an error.
  }
}

/* ─── Container ───────────────────────────────────────────────────────────── */

type Props = {
  quoteId: string;
  initialStatus: QuoteVideoStatus;
  /** Message sent with the file, with the client's quote link once the quote has been sent. */
  shareText?: string;
};

export function QuoteVideoCard({ quoteId, initialStatus, shareText }: Props) {
  const [status, setStatus] = useState<QuoteVideoStatus>(initialStatus);
  const [requesting, setRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);
  const [retry, setRetry] = useState(0);
  const [shareState, setShareState] = useState<ShareState>("idle");
  const pollStartedAt = useRef<number | null>(null);
  const fileRef = useRef<File | null>(null);
  const previewRefreshedAt = useRef(0);
  // Server snapshot: offer "Share video" (the common case on phones); the client corrects it after hydration.
  const canShareFiles = useSyncExternalStore(noSubscription, canShareVideoFiles, () => true);
  const fileHref = `/api/quotes/${encodeURIComponent(quoteId)}/video`;

  // Poll every 5 s while the video is being made; stop after 5 minutes with a plain message.
  useEffect(() => {
    if (status.kind !== "working" || slow) {
      pollStartedAt.current = null;
      return;
    }
    if (pollStartedAt.current === null) pollStartedAt.current = Date.now();
    const startedAt = pollStartedAt.current;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!shouldKeepPolling(startedAt, Date.now())) {
        setSlow(true);
        return;
      }
      const result = await getQuoteVideoStatusAction(quoteId).catch(() => null);
      if (cancelled) return;
      if (result?.ok) setStatus(result.status);
      else setRetry((n) => n + 1); // a failed poll just tries again on the next tick
    }, QUOTE_VIDEO_POLL.intervalMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [status, slow, retry, quoteId]);

  async function request() {
    if (requesting) return;
    setRequesting(true);
    setError(null);
    setSlow(false);
    fileRef.current = null;
    setShareState("idle");
    try {
      const result = await requestQuoteVideoAction(quoteId);
      if (result.ok) setStatus(result.status);
      else setError(result.error);
    } catch {
      setError("We couldn't start the video. Check your connection and try again.");
    } finally {
      setRequesting(false);
    }
  }

  function checkAgain() {
    setSlow(false);
    setRetry((n) => n + 1);
  }

  // The signed preview URLs last an hour; fetch fresh ones if the preview fails to load.
  async function refreshPreview() {
    if (Date.now() - previewRefreshedAt.current < 30_000) return;
    previewRefreshedAt.current = Date.now();
    const result = await getQuoteVideoStatusAction(quoteId).catch(() => null);
    if (result?.ok) setStatus(result.status);
  }

  async function share() {
    if (status.kind !== "ready" || shareState === "preparing") return;
    setShareState("preparing");
    try {
      let file = fileRef.current;
      if (!file) {
        const res = await fetch(fileHref, { credentials: "same-origin" });
        if (!res.ok) throw new Error(`video ${res.status}`);
        file = new File([await res.blob()], status.fileName, { type: "video/mp4" });
        fileRef.current = file;
      }
      if (isNativeIOSApp()) await shareInNativeApp(file, shareText);
      else await navigator.share({ files: [file], title: "Your quote video", ...(shareText ? { text: shareText } : {}) });
      setShareState("idle");
    } catch (e) {
      const name = e instanceof DOMException ? e.name : "";
      if (name === "AbortError") setShareState("idle"); // share sheet closed
      else if (name === "NotAllowedError" && fileRef.current) setShareState("again"); // the download outlasted the tap
      else setShareState("error");
    }
  }

  return (
    <QuoteVideoCardView
      status={status}
      requesting={requesting}
      slow={slow}
      error={error}
      canShareFiles={canShareFiles}
      shareState={shareState}
      fileHref={fileHref}
      onRequest={request}
      onCheckAgain={checkAgain}
      onShare={share}
      onPreviewError={refreshPreview}
    />
  );
}
