import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("@/lib/fetchTimeout", () => ({ fetchWithTimeout: h.fetch, TIMEOUTS: { email: 1000 } }));

import {
  engagementRecipient,
  replyToFor,
  sendFollowupEmail,
  sendReviewRequestEmail,
  sentToAddress,
} from "./engagement";

beforeEach(() => {
  h.fetch.mockReset();
  h.fetch.mockResolvedValue(new Response(JSON.stringify({ id: "msg_1" }), { status: 200 }));
  vi.stubEnv("RESEND_API_KEY", "test-only");
  vi.stubEnv("RESEND_FROM_EMAIL", "quotes@tradies2quote.example");
});
afterEach(() => vi.unstubAllEnvs());

describe("who engagement emails go to", () => {
  it("the newest address the quote was emailed to", () => {
    expect(
      sentToAddress([
        { metadata: { to: "second@client.example" } },
        { metadata: { to: "first@client.example" } },
      ]),
    ).toBe("second@client.example");
  });

  it("skips text-message sends and junk", () => {
    expect(
      sentToAddress([
        { metadata: { channel: "sms", to: "+64211234567" } },
        { metadata: { channel: "sms_device", trigger: "share" } },
        { metadata: null },
        { metadata: { to: "not an email" } },
        { metadata: { channel: "email", to: " real@client.example " } },
      ]),
    ).toBe("real@client.example");
    expect(sentToAddress([])).toBeNull();
  });

  it("falls back to the email on the quote (or its legacy contact field), never anything else", () => {
    expect(engagementRecipient([], { email: "on-quote@client.example" })).toBe("on-quote@client.example");
    expect(engagementRecipient([], { email: "", contact: "legacy@client.example" })).toBe("legacy@client.example");
    expect(engagementRecipient([], { email: null, contact: "021 555 1234" })).toBeNull();
    expect(engagementRecipient([{ metadata: { to: "sent@client.example" } }], { email: "on-quote@client.example" })).toBe("sent@client.example");
  });

  it("reply-to is the tradie's business email when it is a real address", () => {
    expect(replyToFor("office@bayside.example")).toBe("office@bayside.example");
    expect(replyToFor("")).toBeNull();
    expect(replyToFor(null)).toBeNull();
    expect(replyToFor("nope")).toBeNull();
  });
});

describe("sending", () => {
  const body = () => JSON.parse(String((h.fetch.mock.calls[0][1] as RequestInit).body)) as Record<string, unknown>;

  it("a follow-up carries the tradie's reply-to", async () => {
    await sendFollowupEmail({
      to: "client@client.example",
      clientName: "Aroha",
      businessName: "Bayside Builders",
      quoteNumber: "Q-1001",
      total: "$1,150.00",
      acceptUrl: "https://tradies2quote.com/quote/tok",
      step: 1,
      replyTo: "office@bayside.example",
    });
    expect(body()).toMatchObject({ to: ["client@client.example"], reply_to: "office@bayside.example" });
  });

  it("a review request carries it too, and without one there is no reply_to field", async () => {
    await sendReviewRequestEmail({ to: "client@client.example", clientName: "Aroha", businessName: "Bayside", reviewUrl: "https://g.page/r/x", replyTo: "office@bayside.example" });
    expect(body()).toMatchObject({ reply_to: "office@bayside.example" });
    h.fetch.mockClear();
    await sendReviewRequestEmail({ to: "client@client.example", clientName: "Aroha", businessName: "Bayside", reviewUrl: "https://g.page/r/x" });
    expect(body()).not.toHaveProperty("reply_to");
  });
});
