import { describe, expect, it } from "vitest";
import { isLinkPreviewBot } from "./bot-detection";

describe("isLinkPreviewBot", () => {
  it("catches the iMessage / Apple preview fetcher (impersonates FB+Twitter)", () => {
    // The exact UA Apple Messages sends when unfurling a link.
    expect(
      isLinkPreviewBot("facebookexternalhit/1.1 Facebot Twitterbot/1.0"),
    ).toBe(true);
    expect(isLinkPreviewBot("Applebot/0.1")).toBe(true);
  });

  it("catches the common messaging + social preview crawlers", () => {
    for (const ua of [
      "WhatsApp/2.23.20.0 A",
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "TelegramBot (like TwitterBot)",
      "Discordbot/2.0 (+https://discordapp.com)",
      "LinkedInBot/1.0 (compatible; Mozilla/5.0)",
      "Mozilla/5.0 (compatible; redditbot/1.0)",
      "SkypeUriPreview Preview/0.5",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    ]) {
      expect(isLinkPreviewBot(ua), ua).toBe(true);
    }
  });

  it("does NOT match a real mobile Safari (must still record the human view)", () => {
    expect(
      isLinkPreviewBot(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      ),
    ).toBe(false);
  });

  it("does NOT match a real desktop Chrome", () => {
    expect(
      isLinkPreviewBot(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
  });

  it("handles missing / empty UA safely", () => {
    expect(isLinkPreviewBot(null)).toBe(false);
    expect(isLinkPreviewBot(undefined)).toBe(false);
    expect(isLinkPreviewBot("")).toBe(false);
  });
});
