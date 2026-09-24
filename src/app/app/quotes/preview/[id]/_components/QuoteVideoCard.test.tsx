import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("../video-actions", () => ({
  requestQuoteVideoAction: vi.fn(),
  getQuoteVideoStatusAction: vi.fn(),
}));

import { QuoteVideoCard, QuoteVideoCardView, type QuoteVideoCardViewProps } from "./QuoteVideoCard";
import type { QuoteVideoStatus } from "@/lib/quote-video/status";

const noop = () => undefined;
const READY: QuoteVideoStatus = {
  kind: "ready",
  videoUrl: "https://api.example.test/storage/v1/object/sign/quote-videos/v3.mp4?token=a",
  posterUrl: "https://api.example.test/storage/v1/object/sign/quote-videos/v3.jpg?token=b",
  fileName: "Q-2026-5D0A-video.mp4",
};

function view(props: Partial<QuoteVideoCardViewProps>) {
  return renderToStaticMarkup(
    createElement(QuoteVideoCardView, {
      status: { kind: "none" },
      requesting: false,
      slow: false,
      error: null,
      canShareFiles: true,
      shareState: "idle",
      fileHref: "/api/quotes/q1/video",
      onRequest: noop,
      onCheckAgain: noop,
      onShare: noop,
      ...props,
    }),
  );
}

/** The opening tag of the element carrying `data-testid`. */
const tag = (html: string, testId: string) => html.match(new RegExp(`<[a-z]+[^>]*data-testid="${testId}"[^>]*>`))?.[0] ?? "";

describe("quote video card — states", () => {
  it("offers to make a video, with a 56 px main button", () => {
    const html = view({ status: { kind: "none" } });
    expect(html).toContain("Make a quote video");
    expect(html).toContain("15-second video");
    expect(tag(html, "quote-video-make")).toContain("min-h-[56px]");
    expect(tag(html, "quote-video-make")).not.toContain('disabled=""');
  });

  it("disables the button while the request is on its way", () => {
    const html = view({ status: { kind: "none" }, requesting: true });
    expect(html).toContain("Starting…");
    expect(tag(html, "quote-video-make")).toContain('disabled=""');
  });

  it.each(["queued", "rendering"] as const)("shows the wait message while %s", (phase) => {
    const html = view({ status: { kind: "working", phase } });
    expect(html).toContain("Making your video… usually under a minute.");
    expect(tag(html, "quote-video-working")).toContain('role="status"');
    expect(html).not.toContain("quote-video-make");
  });

  it("says plainly when it is taking longer than five minutes, with a 48 px check-again button", () => {
    const html = view({ status: { kind: "working", phase: "rendering" }, slow: true });
    expect(html).toContain("This is taking longer than usual.");
    expect(html).not.toContain("usually under a minute");
    expect(tag(html, "quote-video-check-again")).toContain("min-h-[48px]");
  });

  it("previews a ready video without autoplay, inline, loading nothing until played", () => {
    const html = view({ status: READY });
    const video = tag(html, "quote-video-preview");
    expect(video).toContain(`poster="${READY.kind === "ready" ? READY.posterUrl.replace(/&/g, "&amp;") : ""}"`);
    expect(video).toContain('preload="none"');
    expect(video).toContain('playsInline=""');
    expect(video).toContain('controls=""');
    expect(video).not.toContain("autoPlay");
    expect(html).toContain("It also plays at the top of your client&#x27;s quote link.");
  });

  it("offers Share video where the phone can share files", () => {
    const html = view({ status: READY, canShareFiles: true });
    expect(tag(html, "quote-video-share")).toContain("min-h-[56px]");
    expect(html).toContain("Share video");
    expect(html).not.toContain("quote-video-download");
  });

  it("falls back to Download video from our own origin where file sharing is not supported", () => {
    const html = view({ status: READY, canShareFiles: false });
    const link = tag(html, "quote-video-download");
    expect(link).toContain('href="/api/quotes/q1/video"');
    expect(link).toContain('download="Q-2026-5D0A-video.mp4"');
    expect(html).toContain("Download video");
    expect(html).not.toContain("quote-video-share");
  });

  it("guides the owner through the share steps", () => {
    expect(view({ status: READY, shareState: "preparing" })).toContain("Getting the video ready…");
    expect(view({ status: READY, shareState: "again" })).toContain("Tap Share video again.");
    const failed = view({ status: READY, shareState: "error" });
    expect(failed).toContain("couldn&#x27;t be shared");
    expect(failed).toContain('href="/api/quotes/q1/video"');
  });

  it("says when the quote changed after the video and offers a new one", () => {
    const html = view({ status: { kind: "stale", hadVideo: true } });
    expect(html).toContain("You&#x27;ve changed this quote since the video was made");
    expect(html).toContain("Make a new video");
    expect(html).not.toContain("quote-video-preview");
    expect(view({ status: { kind: "stale", hadVideo: false } })).toContain("since you asked for a video");
  });

  it("offers to try again after a failed render", () => {
    const html = view({ status: { kind: "failed" } });
    expect(html).toContain("couldn&#x27;t make the video this time");
    expect(html).toContain("Try again");
  });

  it("shows a server message as an alert", () => {
    const html = view({ status: { kind: "none" }, error: "You've made a lot of videos in the last hour." });
    expect(tag(html, "quote-video-error")).toContain('role="alert"');
    expect(html).toContain("lot of videos in the last hour");
  });

  it("renders on the server with the status the page loaded", () => {
    const html = renderToStaticMarkup(createElement(QuoteVideoCard, { quoteId: "q1", initialStatus: READY }));
    expect(html).toContain('data-state="ready"');
    expect(html).toContain("Share video");
  });
});
