import { describe, expect, it, vi } from "vitest";
import {
  MAX_TOTAL_PHOTO_BYTES,
  addRequestPhotos,
  isAcceptedRequestPhoto,
  requestPhotosTooLarge,
} from "./requestPhotoPrep";

const MB = 1024 * 1024;
const file = (name: string, type: string, size: number) =>
  new File([new Uint8Array(size)], name, { type });
/** Stand-in for the on-device compressor: a 9 MB phone photo → ~600 KB JPEG. */
const compress = vi.fn(async (f: File) =>
  file(f.name.replace(/\.\w+$/, ".jpg"), "image/jpeg", Math.min(f.size, 600 * 1024)),
);

describe("public quote request photos — compressed on the device", () => {
  it("compresses three 9 MB phone photos so the upload stays well under the body limit", async () => {
    const picked = [1, 2, 3].map((i) => file(`IMG_00${i}.jpg`, "image/jpeg", 9 * MB));
    const { photos, note } = await addRequestPhotos([], picked, compress);
    expect(compress).toHaveBeenCalledTimes(3);
    expect(note).toBe("");
    expect(photos).toHaveLength(3);
    expect(photos.reduce((n, p) => n + p.size, 0)).toBeLessThan(2 * MB);
    expect(requestPhotosTooLarge(photos)).toBeNull();
  });

  it("accepts iPhone HEIC (converted to JPEG on the device)", async () => {
    const { photos } = await addRequestPhotos([], [file("IMG_1.HEIC", "image/heic", 3 * MB)], compress);
    expect(photos[0].type).toBe("image/jpeg");
    expect(isAcceptedRequestPhoto({ name: "IMG_2.heic", type: "" })).toBe(true);
  });

  it("explains a photo that is still too large after compressing instead of sending it", async () => {
    const stubborn = async (f: File) => file(f.name, "image/jpeg", 11 * MB);
    const { photos, note } = await addRequestPhotos([], [file("huge.jpg", "image/jpeg", 25 * MB)], stubborn);
    expect(photos).toEqual([]);
    expect(note).toMatch(/huge\.jpg is still 11\.0 MB after compressing — too large to send/);
  });

  it("explains a photo the device can't read", async () => {
    const broken = async () => {
      throw new Error("decode failed");
    };
    const { photos, note } = await addRequestPhotos([], [file("odd.heic", "image/heic", 2 * MB)], broken);
    expect(photos).toEqual([]);
    expect(note).toMatch(/couldn't be read/);
  });

  it("keeps the set under the total budget and says why a photo was left out", async () => {
    const big = async (f: File) => file(f.name, "image/jpeg", 5 * MB);
    const { photos, note } = await addRequestPhotos([], [file("a.jpg", "image/jpeg", 6 * MB), file("b.jpg", "image/jpeg", 6 * MB)], big);
    expect(photos.map((p) => p.name)).toEqual(["a.jpg"]);
    expect(note).toMatch(/b\.jpg would make the photos too large to send together/);
  });

  it("caps the count at three and rejects non-image files", async () => {
    const existing = [1, 2, 3].map((i) => file(`p${i}.jpg`, "image/jpeg", MB));
    expect((await addRequestPhotos(existing, [file("p4.jpg", "image/jpeg", MB)], compress)).note).toMatch(/Up to 3 photos/);
    expect((await addRequestPhotos([], [file("plan.pdf", "application/pdf", MB)], compress)).note).toMatch(/JPEG, PNG, WebP or iPhone/);
  });

  it("refuses to send an over-budget set with a clear message (details kept)", () => {
    const tooMuch = [file("a.jpg", "image/jpeg", MAX_TOTAL_PHOTO_BYTES), file("b.jpg", "image/jpeg", 1)];
    expect(requestPhotosTooLarge(tooMuch)).toMatch(/too large to send.*your details are still here/);
  });
});
