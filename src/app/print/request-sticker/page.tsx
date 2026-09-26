import type { Metadata } from "next";
import { StickerSheet } from "../_components/StickerSheet";
import { loadRequestPrint } from "../_lib/request-print";
import { stickerHref, stickerSize } from "../_lib/sticker";

export const metadata: Metadata = { title: "Request-a-quote stickers", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** /print/request-sticker(?size=small): the sticker sheet (StickerSheet) for the signed-in tradie's request QR. */
export default async function RequestStickerPage({ searchParams }: { searchParams: Promise<{ size?: string | string[] }> }) {
  const size = stickerSize((await searchParams).size);
  return <StickerSheet data={await loadRequestPrint(stickerHref(size))} size={size} />;
}
