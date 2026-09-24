import { describe, expect, it } from "vitest";
import {
  QUOTE_VIDEO_POLL,
  describeQuoteVideo,
  publicQuoteVideoFiles,
  quoteVideoFileName,
  shouldKeepPolling,
  type QuoteVideoRow,
} from "./status";

const ready = (version: number): QuoteVideoRow => ({
  quote_version: version,
  status: "ready",
  storage_path: `u/q/v${version}.mp4`,
  poster_path: `u/q/v${version}.jpg`,
});

describe("public quote page — only the current version is ever shown", () => {
  it("shows a ready video made from the quote's current version", () => {
    expect(publicQuoteVideoFiles(ready(3), 3)).toEqual({ video: "u/q/v3.mp4", poster: "u/q/v3.jpg" });
  });

  it.each([
    ["an older version (the quote changed after the video)", ready(2), 3],
    ["a newer version than the page shows", ready(4), 3],
    ["a render still queued", { ...ready(3), status: "queued" }, 3],
    ["a render in progress", { ...ready(3), status: "rendering" }, 3],
    ["a failed render", { ...ready(3), status: "failed" }, 3],
    ["a ready row without a video file", { ...ready(3), storage_path: null }, 3],
    ["a ready row without a poster", { ...ready(3), poster_path: null }, 3],
    ["no row at all", null, 3],
    ["a missing page version", ready(3), Number.NaN],
  ])("shows nothing for %s", (_label, row, version) => {
    expect(publicQuoteVideoFiles(row as QuoteVideoRow | null, version as number)).toBeNull();
  });
});

describe("owner card status", () => {
  it.each([
    [null, 3, { kind: "none" }],
    [{ ...ready(3), status: "queued" }, 3, { kind: "working", phase: "queued" }],
    [{ ...ready(3), status: "rendering" }, 3, { kind: "working", phase: "rendering" }],
    [ready(3), 3, { kind: "ready", storagePath: "u/q/v3.mp4", posterPath: "u/q/v3.jpg" }],
    [{ ...ready(3), status: "failed" }, 3, { kind: "failed" }],
    [{ ...ready(3), storage_path: null }, 3, { kind: "failed" }],
    [ready(2), 3, { kind: "stale", hadVideo: true }],
    [{ ...ready(2), status: "queued" }, 3, { kind: "stale", hadVideo: false }],
    [{ ...ready(2), status: "failed" }, 3, { kind: "stale", hadVideo: false }],
    [ready(5), 3, { kind: "none" }],
    [{ ...ready(3), status: "mystery" }, 3, { kind: "none" }],
  ])("%j at version %i → %j", (row, version, expected) => {
    expect(describeQuoteVideo(row as QuoteVideoRow | null, version)).toEqual(expected);
  });
});

describe("polling and file names", () => {
  it("polls for five minutes", () => {
    expect(QUOTE_VIDEO_POLL.intervalMs).toBe(5_000);
    expect(shouldKeepPolling(0, 4 * 60_000)).toBe(true);
    expect(shouldKeepPolling(0, 5 * 60_000)).toBe(false);
  });

  it("names the file after the quote number", () => {
    expect(quoteVideoFileName("Q-2026-5D0A")).toBe("Q-2026-5D0A-video.mp4");
    expect(quoteVideoFileName('Q "2026"/../x')).toBe("Q2026x-video.mp4");
    expect(quoteVideoFileName("")).toBe("quote-video.mp4");
  });
});
