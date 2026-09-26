/**
 * Your QR code's how-to, as data (pure): printing a sticker that survives
 * the weather, where on the van it scans, how big it needs to be, testing
 * it, and what happens when someone scans it. No plans or prices, so the
 * same words work in the iPhone app.
 */

import { STICKER_PATH } from "@/app/print/_lib/sticker";

export const STICKER_HREF = STICKER_PATH;
export const POSTER_PATH = "/print/request-poster";

export interface GuideStep {
  id: "print" | "place" | "size" | "test" | "requests";
  title: string;
  body: string;
}

export const QR_GUIDE: readonly GuideStep[] = [
  {
    id: "print",
    title: "Print it",
    body: "Print the sticker on outdoor vinyl sticker paper (office supply shops sell it for home printers), then cover it with clear laminate so the rain doesn’t fade it. For a bigger, tougher decal, give the SVG to a sign-writer.",
  },
  {
    id: "place",
    title: "Stick it where people can get close",
    body: "The side of the van, the tailgate or a back window, at about eye height. Put it on the outside of the glass: tint makes a code hard to scan.",
  },
  {
    id: "size",
    title: "Make it big enough",
    body: "A code scans from about ten times its width. The big sticker’s 11 cm code works from about a metre away. For across the street, ask a sign-writer to make it bigger.",
  },
  {
    id: "test",
    title: "Test it before you drive off",
    body: "Open your phone’s camera, point it at the code and tap the link. Your request page should open.",
  },
  {
    id: "requests",
    title: "The jobs come to you",
    body: "Whoever scans it tells you about the job in their own words and can add photos. It lands in Client requests as a draft quote for you to check, price and send.",
  },
];
