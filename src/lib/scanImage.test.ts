import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { needsPrep, prepareScanImage } from "./scanImage";

// Minimal browser stand-ins: an <img> that "decodes" instantly and a canvas
// whose encoder records what it was asked for. Enough to prove whether the
// scan prep re-encodes (and so drops camera EXIF/GPS) or passes bytes through.
const encoded: Array<{ type: string; quality?: number }> = [];

class FakeImage {
  naturalWidth = 1200;
  naturalHeight = 900;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(_url: string) {
    queueMicrotask(() => this.onload?.());
  }
}

function fakeCanvas() {
  return {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => {}, fillRect: () => {}, fillStyle: "" }),
    toBlob: (cb: (b: Blob | null) => void, type: string, quality?: number) => {
      encoded.push({ type, quality });
      cb(new Blob([new Uint8Array(2048)], { type }));
    },
  };
}

beforeEach(() => {
  encoded.length = 0;
  vi.stubGlobal("document", {
    createElement: (tag: string) => (tag === "img" ? new FakeImage() : fakeCanvas()),
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:test");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// A small phone JPEG: "FF D8 FF E1 … Exif" — the APP1 block where GPS lives.
const smallJpeg = () =>
  new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x10, 0x45, 0x78, 0x69, 0x66, 0, 0, 1, 2, 3, 4])], "site.jpg", {
    type: "image/jpeg",
  });

describe("prepareScanImage — never forwards camera metadata", () => {
  it("re-encodes even a small JPEG (so EXIF/GPS is dropped), instead of passing it through", async () => {
    const input = smallJpeg();
    const out = await prepareScanImage(input);
    expect(out).not.toBe(input);
    expect(encoded).toEqual([{ type: "image/jpeg", quality: 0.8 }]);
    expect(out.type).toBe("image/jpeg");
    expect(out.name).toBe("site.jpg");
  });

  it("keeps a small PNG drawing lossless (PNG in, PNG out) but still re-encoded", async () => {
    const png = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])], "plan.png", { type: "image/png" });
    const out = await prepareScanImage(png);
    expect(out).not.toBe(png);
    expect(encoded[0].type).toBe("image/png");
    expect(out.type).toBe("image/png");
  });

  it("asks every caller (including the drawing scan) to prep every image", () => {
    expect(needsPrep(smallJpeg())).toBe(true);
  });
});
