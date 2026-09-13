import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/observability", () => ({ captureError: vi.fn() }));
vi.mock("@/lib/quote-photos", () => ({
  MAX_PHOTO_BYTES: 10 * 1024 * 1024,
  PHOTO_BUCKET: "quote-attachments",
  normaliseQuotePhoto: async (bytes: Uint8Array) => {
    if (bytes.length < 4) throw new Error("bad image");
    return Buffer.from(bytes);
  },
}));
vi.mock("@/lib/agents/photo-plan", () => ({ runPhotoPlanAgent: vi.fn() }));

import { composePhotoNotes, describePhotosIntoTranscript, storeRequestPhotos } from "../photos";

const result = {
  description: "A tired timber deck about 4 metres wide with rotten boards.",
  items: [
    { label: "Timber decking boards", location: null, note: null, confidence: 0.8, ai_estimated: true },
    { label: "Handrail", location: null, note: null, confidence: 0.6, ai_estimated: true },
  ],
  reviewFlags: ["Measure deck length on site"],
  quoteNote: "n/a",
};

describe("composePhotoNotes", () => {
  it("writes one line per described photo and skips failures", () => {
    const notes = composePhotoNotes([
      { name: "a.jpg", result },
      { name: "b.jpg", result: null },
    ]);
    expect(notes).toBe(
      "Client photo 1: A tired timber deck about 4 metres wide with rotten boards. Items seen: Timber decking boards, Handrail. Check on site: Measure deck length on site.",
    );
  });
  it("returns empty when nothing was described", () => {
    expect(composePhotoNotes([{ name: "a.jpg", result: null }])).toBe("");
  });
});

function fakeAdmin() {
  const calls: string[] = [];
  const removed: string[] = [];
  let transcript = "Client says: build a deck.";
  const admin = {
    storage: {
      from: () => ({
        upload: async (path: string) => {
          calls.push(`upload:${path}`);
          return { error: null };
        },
        remove: async (paths: string[]) => {
          removed.push(...paths);
          return { error: null };
        },
      }),
    },
    rpc: async (_name: string, args: { p_data: { path: string } }) => {
      calls.push(`rpc:${args.p_data.path}`);
      return { data: { id: "att-1", name: "x" }, error: null };
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { voice_transcript: transcript } }) }),
        }),
      }),
      update: (patch: { voice_transcript: string }) => ({
        eq: () => ({
          eq: async () => {
            transcript = patch.voice_transcript;
            return { error: null };
          },
        }),
      }),
    }),
  };
  return { admin: admin as never, calls, removed, transcript: () => transcript };
}

describe("storeRequestPhotos", () => {
  it("normalises, uploads under the tradie/quote prefix and registers each usable photo", async () => {
    const { admin, calls } = fakeAdmin();
    const stored = await storeRequestPhotos({
      admin,
      tradieUserId: "u1",
      quoteId: "q1",
      photos: [
        { bytes: new Uint8Array([1, 2, 3, 4, 5]), name: "deck.jpg" },
        { bytes: new Uint8Array([1]), name: "broken.bin" },
      ],
    });
    expect(stored).toHaveLength(1);
    expect(stored[0].name).toBe("deck.jpg");
    expect(calls.filter((c) => c.startsWith("upload:u1/q1/"))).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith("rpc:u1/q1/"))).toHaveLength(1);
  });

  it("caps at three photos", async () => {
    const { admin, calls } = fakeAdmin();
    const photos = Array.from({ length: 5 }, (_, i) => ({ bytes: new Uint8Array([1, 2, 3, 4, i]), name: `p${i}.jpg` }));
    const stored = await storeRequestPhotos({ admin, tradieUserId: "u1", quoteId: "q1", photos });
    expect(stored).toHaveLength(3);
    expect(calls.filter((c) => c.startsWith("upload:"))).toHaveLength(3);
  });
});

describe("describePhotosIntoTranscript", () => {
  it("appends the photo notes to the draft transcript", async () => {
    const { admin, transcript } = fakeAdmin();
    const notes = await describePhotosIntoTranscript({
      admin,
      tradieUserId: "u1",
      quoteId: "q1",
      photos: [{ id: "att-1", name: "deck.jpg", jpeg: Buffer.from([1, 2, 3]) }],
      describe: async () => result,
    });
    expect(notes).toContain("Client photo 1:");
    expect(transcript()).toContain("Client says: build a deck.\n\nWhat the client's photos show:\nClient photo 1:");
  });

  it("does nothing without photos", async () => {
    const { admin, transcript } = fakeAdmin();
    const notes = await describePhotosIntoTranscript({ admin, tradieUserId: "u1", quoteId: "q1", photos: [] });
    expect(notes).toBe("");
    expect(transcript()).toBe("Client says: build a deck.");
  });
});
