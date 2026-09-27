// The photo reader both looks share (usePhotoPlan runs on readPhotoPlan and
// sendPhotoPlan): the photo is prepared, sent to /api/agents/photo-plan, and
// its answer or a plain error comes back. With `consent` (the new look's
// "Add from a plan photo" sheet in the iPhone app) nothing is sent before the
// tradie agrees, exactly like the supplier scanner; without it (the classic
// panel) the route's refusal is shown as before.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prep = vi.hoisted(() => ({ fn: vi.fn(async (file: File) => file) }));
vi.mock("@/lib/scanImage", () => ({ prepareScanImage: prep.fn }));

import type { PhotoPlanResult } from "@/lib/agents/photo-plan";
import { readPhotoPlan, sendPhotoPlan } from "./PhotoPlanPanel";

const RESULT: PhotoPlanResult = {
  description: "A deck plan with the piles marked.",
  items: [{ label: "Concrete pile", location: null, note: null, confidence: 0.7, ai_estimated: true }],
  reviewFlags: ["No scale on the drawing."],
  quoteNote: "Build the deck as drawn.",
};
/** The route's answer in the iPhone app with no consent on record (lib/ai-consent.ts). */
const NO_CONSENT = {
  error: "ai_consent_required",
  message: "Turn on AI features to use voice, scan and quote generation. Open a new quote to review and enable it.",
};

const photo = (name = "plan.jpg", type = "image/jpeg") => new File([new Uint8Array(2048)], name, { type });
const reply = (status: number, body: unknown) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
const read = () => reply(200, { ok: true, result: RESULT });

const fetchMock = vi.fn<typeof fetch>();
const sent = () => fetchMock.mock.calls.map(([, init]) => init?.body as FormData);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  prep.fn.mockReset();
  prep.fn.mockImplementation(async (file: File) => file);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendPhotoPlan: one upload", () => {
  it("posts the photo and the trimmed note to the reader, and hands back what it read", async () => {
    fetchMock.mockResolvedValueOnce(read());
    const image = photo();
    expect(await sendPhotoPlan(image, "  north wall ")).toEqual({ ok: true, page: RESULT });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/agents/photo-plan");
    expect(init?.method).toBe("POST");
    const form = init?.body as FormData;
    expect((form.get("image") as File).name).toBe("plan.jpg");
    expect(form.get("hint")).toBe("north wall");
  });

  it("sends no note when none was typed", async () => {
    fetchMock.mockResolvedValueOnce(read());
    await sendPhotoPlan(photo(), "   ");
    expect(sent()[0].has("hint")).toBe(false);
  });

  it("a refusal keeps its code (for the consent step) and says it in plain words", async () => {
    fetchMock.mockResolvedValueOnce(reply(403, NO_CONSENT));
    expect(await sendPhotoPlan(photo(), "")).toEqual({
      ok: false,
      status: 403,
      code: "ai_consent_required",
      error: NO_CONSENT.message,
    });
  });

  it("a proxy error page is never shown raw", async () => {
    fetchMock.mockResolvedValueOnce(reply(502, "<html>Bad gateway</html>"));
    expect(await sendPhotoPlan(photo(), "")).toEqual({
      ok: false,
      status: 502,
      code: undefined,
      error: "Photo reading failed. Please try again.",
    });
  });
});

describe("readPhotoPlan without consent (the classic panel)", () => {
  it("prepares the photo, then reads it", async () => {
    fetchMock.mockResolvedValueOnce(read());
    expect(await readPhotoPlan(photo(), "")).toEqual({ kind: "read", result: RESULT });
    expect(prep.fn).toHaveBeenCalledTimes(1);
  });

  it("shows the route's consent refusal as its error, and never asks", async () => {
    fetchMock.mockResolvedValueOnce(reply(403, NO_CONSENT));
    expect(await readPhotoPlan(photo(), "")).toEqual({ kind: "failed", error: NO_CONSENT.message });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends the converted copy, and says so before it goes", async () => {
    const converted = photo("plan.jpg", "image/jpeg");
    prep.fn.mockResolvedValueOnce(converted);
    const events: string[] = [];
    fetchMock.mockImplementationOnce(async () => {
      events.push("sent");
      return read();
    });
    const outcome = await readPhotoPlan(photo("IMG_0042.HEIC", "image/heic"), "", {
      onPrepared: (upload) => events.push(upload === converted ? "prepared copy" : "other"),
    });
    expect(outcome.kind).toBe("read");
    expect(events).toEqual(["prepared copy", "sent"]);
    expect(sent()[0].get("image")).toBe(converted);
  });

  it("the same photo back from preparing isn't announced", async () => {
    fetchMock.mockResolvedValueOnce(read());
    const onPrepared = vi.fn();
    await readPhotoPlan(photo(), "", { onPrepared });
    expect(onPrepared).not.toHaveBeenCalled();
  });

  it("a photo it can't prepare, or still too big, never leaves the phone", async () => {
    prep.fn.mockRejectedValueOnce(new Error("image_prepare_failed"));
    expect(await readPhotoPlan(photo(), "")).toEqual({
      kind: "failed",
      error: 'Couldn’t read that photo. Upload a JPEG, or switch your iPhone Camera to "Most Compatible".',
    });
    prep.fn.mockResolvedValueOnce({ name: "plan.jpg", type: "image/jpeg", size: 9 * 1024 * 1024 } as File);
    expect(await readPhotoPlan(photo(), "")).toEqual({
      kind: "failed",
      error: "Image is 9.0 MB after compression. Try cropping or taking a closer photo.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a dropped connection is thrown for the hook to word", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(readPhotoPlan(photo(), "")).rejects.toThrow("Failed to fetch");
  });
});

describe("readPhotoPlan with consent (the new look in the iPhone app)", () => {
  it("asks before anything is sent, then reads", async () => {
    const events: string[] = [];
    fetchMock.mockImplementationOnce(async () => {
      events.push("sent");
      return read();
    });
    const outcome = await readPhotoPlan(photo(), "", {
      consent: {
        needed: true,
        ask: async () => {
          events.push("asked");
          return true;
        },
      },
    });
    expect(outcome).toEqual({ kind: "read", result: RESULT });
    expect(events).toEqual(["asked", "sent"]);
  });

  it("sends nothing when the tradie doesn't agree", async () => {
    const outcome = await readPhotoPlan(photo(), "", { consent: { needed: true, ask: async () => false } });
    expect(outcome).toEqual({ kind: "declined" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("doesn't ask while consent is on record", async () => {
    fetchMock.mockResolvedValueOnce(read());
    const ask = vi.fn(async () => true);
    expect(await readPhotoPlan(photo(), "", { consent: { needed: false, ask } })).toEqual({ kind: "read", result: RESULT });
    expect(ask).not.toHaveBeenCalled();
  });

  it("consent withdrawn since the page loaded: the route turns it away, we ask, then send it once more", async () => {
    fetchMock.mockResolvedValueOnce(reply(403, NO_CONSENT)).mockResolvedValueOnce(read());
    const ask = vi.fn(async () => true);
    expect(await readPhotoPlan(photo(), "", { consent: { needed: false, ask } })).toEqual({ kind: "read", result: RESULT });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("and says no: nothing more is sent", async () => {
    fetchMock.mockResolvedValueOnce(reply(403, NO_CONSENT));
    const outcome = await readPhotoPlan(photo(), "", { consent: { needed: false, ask: async () => false } });
    expect(outcome).toEqual({ kind: "declined" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("any other refusal is the error, in plain words", async () => {
    fetchMock.mockResolvedValueOnce(reply(429, { error: "rate_limited" }));
    const ask = vi.fn(async () => true);
    expect(await readPhotoPlan(photo(), "", { consent: { needed: false, ask } })).toEqual({
      kind: "failed",
      error: "You've reached today's limit for photo reading. It resets at midnight UTC.",
    });
    expect(ask).not.toHaveBeenCalled();
  });
});
