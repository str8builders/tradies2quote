import { describe, expect, it } from "vitest";
import { BUSINESS_NAME_REQUIRED } from "@/lib/business-name";
import type { QuoteData, QuoteLineItem } from "@/lib/quote-types";
import { SEND_ERROR_MESSAGES, assessQuoteTakeoffSafety } from "@/lib/quote-validation";
import { withLines } from "./lines";
import {
  channelAddress,
  checkSend,
  draftBlocker,
  fixFor,
  plainReason,
  preferredChannel,
  readSendResponse,
  sendErrorMessage,
  sentMessage,
  textableNumber,
} from "./send-flow";

const priced: QuoteLineItem = {
  type: "labour",
  description: "Labour",
  quantity: 3,
  unit: "day",
  unit_price: 560,
  line_total: 1680,
};
const unpriced: QuoteLineItem = {
  type: "material",
  description: "Joist hangers",
  quantity: 28,
  unit: "each",
  unit_price: 0,
  line_total: 0,
  is_missing_price: true,
};
const aiQuantity: QuoteLineItem = {
  type: "material",
  description: "Decking boards",
  quantity: 40,
  unit: "length",
  unit_price: 36,
  line_total: 1440,
  quantity_source: "ai",
  quantity_confirmed: false,
};

const base: QuoteData = {
  client: { name: "Sam Taylor", address: null, email: "sam@example.invalid", phone: "021 555 0101" },
  job_summary: "Labour only job",
  line_items: [],
  materials_subtotal: 0,
  labour_subtotal: 0,
  markup_pct: 0,
  markup_amount: 0,
  subtotal_before_tax: 0,
  tax_amount: 0,
  total: 0,
  currency: "NZD",
  tax_label: "GST",
  tax_rate: 15,
  terms: "",
  notes: [],
};

/** Quote data as the page will save it. */
const data = (lines: QuoteLineItem[], client: Partial<QuoteData["client"]> = {}) =>
  withLines(base, lines, { ...base.client, ...client });

const input = (quote: QuoteData, status = "draft") => ({ status, data: quote, description: null });

describe("send pre-check runs the classic send gate", () => {
  it("is ready with the address or normalised number the route will use", () => {
    expect(checkSend("email", input(data([priced])))).toEqual({ state: "ready", to: "sam@example.invalid" });
    expect(checkSend("sms", input(data([priced])))).toEqual({ state: "ready", to: "+64215550101" });
  });

  it("asks for a confirmation for $0 lines (the acknowledgement path), with the gate's reasons", () => {
    const check = checkSend("email", input(data([priced, unpriced])));
    expect(check.state).toBe("confirm");
    if (check.state !== "confirm") return;
    expect(check.to).toBe("sam@example.invalid");
    expect(check.reasons.join(" ")).toMatch(/no price set and will quote at \$0: Joist hangers/);
  });

  it("blocks an unconfirmed AI quantity with the gate's reason (no override)", () => {
    const check = checkSend("email", input(data([aiQuantity])));
    expect(check.state).toBe("blocked");
    if (check.state === "blocked") expect(check.reasons.join(" ")).toMatch(/AI-estimated quantity/);
  });

  it("points at the client sheet when the email or number is missing or wrong", () => {
    expect(checkSend("email", input(data([priced], { email: null })))).toMatchObject({
      state: "fix",
      code: "client_email_missing",
      fix: "client",
    });
    expect(checkSend("email", input(data([priced], { email: "sam at home" })))).toMatchObject({ code: "client_email_invalid" });
    expect(checkSend("sms", input(data([priced], { phone: null })))).toMatchObject({ code: "client_phone_missing", fix: "client" });
    expect(checkSend("email", input(data([priced], { name: "TBC" })))).toMatchObject({ code: "client_name_missing" });
  });

  it("points at the lines when there is nothing to charge for", () => {
    expect(checkSend("email", input(data([])))).toMatchObject({ code: "no_line_items", fix: "lines" });
  });

  it("refuses an accepted or underway job exactly like the routes", () => {
    expect(checkSend("email", input(data([priced]), "accepted"))).toMatchObject({ code: "already_accepted", fix: null });
    expect(checkSend("sms", input(data([priced]), "scheduled"))).toMatchObject({ code: "job_underway" });
  });

  it("allows re-sending a declined quote (the classic page does too)", () => {
    expect(checkSend("email", input(data([priced]), "declined")).state).toBe("ready");
  });
});

describe("the send routes' answers", () => {
  it("email sent", () => {
    expect(readSendResponse("email", true, { ok: true })).toEqual({ kind: "sent", channel: "email" });
  });

  it("a text for the tradie's own Messages app is not 'sent' yet", () => {
    expect(
      readSendResponse("sms", true, { ok: true, mode: "device", to: "+64215550101", body: "Hi Sam", client_name: "Sam Taylor" }),
    ).toEqual({ kind: "device", to: "+64215550101", body: "Hi Sam", clientName: "Sam Taylor" });
    // A platform (Twilio) text is sent.
    expect(readSendResponse("sms", true, { ok: true })).toEqual({ kind: "sent", channel: "sms" });
  });

  it("the $0-line acknowledgement comes back as a confirm step", () => {
    expect(readSendResponse("email", false, { error: "takeoff_unconfirmed", reasons: ["1 line(s) have no price"] })).toEqual({
      kind: "confirm",
      reasons: ["1 line(s) have no price"],
    });
  });

  it("hard blocks keep their reasons", () => {
    expect(readSendResponse("sms", false, { error: "takeoff_blocked", reasons: ["Fix me"], message: "x" })).toEqual({
      kind: "blocked",
      reasons: ["Fix me"],
      message: "Some lines need fixing before this can go.",
    });
  });

  it("a missing business name points to Settings", () => {
    expect(readSendResponse("email", false, BUSINESS_NAME_REQUIRED)).toEqual({
      kind: "error",
      code: BUSINESS_NAME_REQUIRED.error,
      message: "Add your business name first. It goes on the quote.",
      fix: "settings",
    });
  });

  it("unknown failures use the server's words, then a plain fallback", () => {
    expect(readSendResponse("email", false, { error: "update_failed", message: "Email sent but couldn't update quote status." })).toMatchObject({
      message: "Email sent but couldn't update quote status.",
      fix: null,
    });
    expect(readSendResponse("email", false, "<html>")).toMatchObject({
      message: "The quote didn't send. Check your signal and try again.",
    });
  });
});

describe("send wording", () => {
  it("has plain words for every send-gate code, with no code-style labels", () => {
    for (const code of Object.keys(SEND_ERROR_MESSAGES)) {
      const message = sendErrorMessage(code);
      expect(message).not.toMatch(/\/\/|_/);
      expect(message).toMatch(/^[A-Z]/);
    }
  });

  it("fixes: client fields, lines, settings", () => {
    expect(fixFor("client_phone_invalid")).toBe("client");
    expect(fixFor("total_zero")).toBe("lines");
    expect(fixFor(BUSINESS_NAME_REQUIRED.error)).toBe("settings");
    expect(fixFor("pdf_generation_failed")).toBeNull();
  });

  it("toasts who it went to", () => {
    expect(sentMessage("email", "Sam")).toBe("Quote emailed to Sam");
    expect(sentMessage("sms", null)).toBe("Quote texted");
  });
});

describe("draft blocker for the 'what's next' line", () => {
  it("names the first thing to fix, in order", () => {
    expect(draftBlocker(data([]), null)).toBe("no-lines");
    expect(draftBlocker(data([priced], { name: "To be confirmed" }), null)).toBe("no-client");
    expect(draftBlocker(data([priced], { email: null, phone: null }), null)).toBe("no-contact");
    expect(draftBlocker(data([aiQuantity, unpriced]), null)).toBe("check");
    expect(draftBlocker(data([priced, unpriced]), null)).toBe("unpriced");
    expect(draftBlocker(data([priced]), null)).toBeNull();
  });
});

describe("channels", () => {
  it("prefers email when it works, else a text, else email to show what's missing", () => {
    const ready = { state: "ready", to: "x" } as const;
    const fix = { state: "fix", code: "client_email_missing", message: "", fix: "client" } as const;
    expect(preferredChannel(ready, ready)).toBe("email");
    expect(preferredChannel(fix, ready)).toBe("sms");
    expect(preferredChannel(fix, null)).toBe("email");
    expect(preferredChannel(fix, fix)).toBe("email");
  });

  it("only offers a text to a usable mobile number", () => {
    expect(textableNumber("021 555 0101")).toBe("+64215550101");
    expect(textableNumber("+64 021 555 0101")).toBe("+64215550101");
    expect(textableNumber("555")).toBeNull();
    expect(textableNumber(null)).toBeNull();
  });
});

describe("the gate's reasons in plain words", () => {
  const reasons = (lines: QuoteLineItem[], patch: Partial<QuoteData> = {}) => {
    const s = assessQuoteTakeoffSafety({ ...data(lines), ...patch });
    return [...s.block_reasons, ...s.warning_reasons].map(plainReason);
  };
  const screws: QuoteLineItem = { ...unpriced, description: "Screws" };

  it("rewords the gate's own reasons, keeping every name", () => {
    expect(reasons([priced, unpriced])).toEqual(["Joist hangers has no price, so it will show as $0."]);
    expect(reasons([unpriced, screws])).toEqual(["2 lines have no price, so they will show as $0: Joist hangers, Screws."]);
    expect(reasons([{ ...aiQuantity, description: "Paint tins" }])).toEqual([
      "We estimated the quantity for Paint tins. Check it first.",
    ]);
    // Deck lines on a job with no deck in its description are also held back.
    expect(reasons([aiQuantity])).toContain("We estimated the quantity for Decking boards. Check it first.");
    expect(reasons([aiQuantity]).join(" ")).not.toMatch(/\(s\)/);
    expect(reasons([priced, { ...priced, description: "Scaffold", takeoff_status: "assumed" }])).toEqual([
      "Scaffold was worked out with some guesses.",
    ]);
    expect(reasons([priced, { ...priced, description: "Piles", takeoff_status: "needs_review" }])).toEqual([
      "Have another look at Piles.",
    ]);
    expect(
      reasons([priced, { ...priced, description: "Deck takeoff — needs dimensions", quantity: 0, line_total: 0, takeoff_status: "blocked" }]),
    ).toEqual(["Deck takeoff — needs dimensions needs a size before it can be worked out."]);
  });

  it("drops the internal reason codes from the drawing-size check", () => {
    const out = reasons([priced], {
      dimension_confirmation: {
        required: true,
        reasons: ["no_scale"],
        takeoff_type: "deck",
        dimensions: [{ key: "deckLengthM", label: "Deck length", value: 5.4, unit: "m", confirmed: false }],
      },
    });
    expect(out).toEqual(["Check the sizes we read off your drawing: Deck length."]);
  });

  it("never shows 'line(s)', whatever the wording", () => {
    expect(plainReason("2 blocked line(s) carry a quantity — contradictory state: A, B.")).toBe(
      "2 blocked lines carry a quantity — contradictory state: A, B.",
    );
    expect(plainReason("1 deck material line(s) have no deck evidence on this job: A.")).toBe(
      "1 deck material line have no deck evidence on this job: A.",
    );
    expect(plainReason("Automated check flagged the takeoff as unreliable.")).toBe("Automated check flagged the takeoff as unreliable.");
  });

  it("names where each channel would send", () => {
    expect(channelAddress("email", data([priced]))).toBe("sam@example.invalid");
    expect(channelAddress("sms", data([priced]))).toBe("+64215550101");
    expect(channelAddress("email", data([priced], { email: " " }))).toBeNull();
  });
});
