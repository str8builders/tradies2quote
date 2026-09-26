/** The request-QR sticker sheet's two layouts (pure). */

export type StickerSize = "big" | "small";

export const STICKER_PATH = "/print/request-sticker";

/** ?size=small → four small stickers; anything else → one big one. */
export function stickerSize(value: string | string[] | undefined): StickerSize {
  return value === "small" ? "small" : "big";
}

export function stickerHref(size: StickerSize): string {
  return size === "small" ? `${STICKER_PATH}?size=small` : STICKER_PATH;
}

/** How many stickers a sheet holds. */
export function stickerCount(size: StickerSize): number {
  return size === "small" ? 4 : 1;
}

export const STICKER_SIZES: ReadonlyArray<{ id: StickerSize; label: string; hint: string }> = [
  { id: "big", label: "One big sticker", hint: "Code about 11 cm across. For the side of the van or the tailgate." },
  { id: "small", label: "Four small stickers", hint: "Codes about 6 cm across. For car windows, toolboxes and trailers." },
];
