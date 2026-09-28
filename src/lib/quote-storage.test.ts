import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ upload: vi.fn() }));
vi.mock("./supabase/admin", () => ({
  adminClient: () => ({ storage: { from: () => ({ upload: state.upload }) } }),
}));

import {
  isCurrentLayoutPdfPath,
  isOwnPdfPath,
  isOwnSignaturePath,
  pdfPath,
  uploadSignature,
} from "./quote-storage";

beforeEach(() => {
  state.upload.mockReset().mockResolvedValue({ error: null });
});

describe("signatures — one file per acceptance attempt", () => {
  it("never reuses a name and never overwrites", async () => {
    const a = await uploadSignature("quote-1", new Uint8Array([1]));
    const b = await uploadSignature("quote-1", new Uint8Array([2]));
    expect(a).not.toBe(b);
    expect(a).toMatch(/^quote-1\/signature-[0-9a-f-]{36}\.png$/);
    for (const [path, , options] of state.upload.mock.calls) {
      expect(isOwnSignaturePath("quote-1", path)).toBe(true);
      expect(options).toMatchObject({ upsert: false, contentType: "image/png" });
    }
  });

  it("refuses to overwrite: a clash surfaces as an error", async () => {
    state.upload.mockResolvedValue({ error: { message: "The resource already exists" } });
    await expect(uploadSignature("quote-1", new Uint8Array([1]))).rejects.toThrow(/already exists/);
  });
});

describe("which stored files belong to a quote", () => {
  it("signatures: only files directly in the quote's own folder", () => {
    expect(isOwnSignaturePath("q1", "q1/signature.png")).toBe(true);
    expect(isOwnSignaturePath("q1", "q1/signature-abc.png")).toBe(true);
    for (const bad of ["q2/signature.png", "q1signature.png", "q1/../q2/signature.png", "q1/a/b.png", "q1/", "", null, undefined]) {
      expect(isOwnSignaturePath("q1", bad)).toBe(false);
    }
  });

  it("PDFs: the owner's file for this quote, current or older layout", () => {
    expect(pdfPath("u1", "q1")).toBe("u1/q1/quote-v2.pdf");
    expect(isOwnPdfPath("u1", "q1", "u1/q1/quote-v2.pdf")).toBe(true);
    expect(isOwnPdfPath("u1", "q1", "u1/q1.pdf")).toBe(true);
    for (const bad of ["u2/q1/quote-v2.pdf", "u1/q2.pdf", "u1/q2/quote-v2.pdf", "u1/q1/../../u2/q9.pdf", "u1/q1/a/b.pdf", "q1.pdf", "", null]) {
      expect(isOwnPdfPath("u1", "q1", bad)).toBe(false);
    }
    expect(isCurrentLayoutPdfPath("u1", "q1", "u1/q1/quote-v2.pdf")).toBe(true);
    expect(isCurrentLayoutPdfPath("u1", "q1", "u1/q1.pdf")).toBe(false);
  });
});
