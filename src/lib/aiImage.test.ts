import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareImageForAi, UnreadableImageError } from "./aiImage";

const GPS = {
  IFD0: { Copyright: "t2q-exif-marker" },
  IFD3: { GPSLatitudeRef: "S", GPSLatitude: "37/1 41/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "176/1 10/1 0/1" },
};
const canvas = (width = 40, height = 20) =>
  sharp({ create: { width, height, channels: 3, background: "#ff5f15" } });

describe("prepareImageForAi — nothing but pixels reaches the AI", () => {
  it("drops EXIF/GPS from a small JPEG (the case that used to pass straight through)", async () => {
    const input = await canvas().jpeg().withExif(GPS).toBuffer();
    expect((await sharp(input).metadata()).exif).toBeDefined();
    const { data, mediaType } = await prepareImageForAi(new Uint8Array(input));
    expect(mediaType).toBe("image/jpeg");
    expect(data.includes(Buffer.from("t2q-exif-marker"))).toBe(false);
    const out = await sharp(data).metadata();
    expect(out.exif).toBeUndefined();
    expect(out.xmp).toBeUndefined();
  });

  it("keeps a PNG drawing lossless (PNG out) and drops its EXIF", async () => {
    const input = await canvas().png().withExif(GPS).toBuffer();
    const { data, mediaType } = await prepareImageForAi(new Uint8Array(input));
    expect(mediaType).toBe("image/png");
    expect((await sharp(data).metadata()).exif).toBeUndefined();
  });

  it("bakes the camera orientation into the pixels before dropping it", async () => {
    const input = await canvas(40, 20).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const { data } = await prepareImageForAi(new Uint8Array(input));
    const out = await sharp(data).metadata();
    expect([out.width, out.height]).toEqual([20, 40]);
    expect(out.orientation).toBeUndefined();
  });

  it("refuses bytes that don't decode instead of forwarding them", async () => {
    await expect(prepareImageForAi(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]))).rejects.toBeInstanceOf(UnreadableImageError);
  });
});
