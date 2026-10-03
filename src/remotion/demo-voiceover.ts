/**
 * The narration of the marketing videos: what the voice says, and the
 * caption shown while it says it.
 *
 *   demo    DemoWide, DemoTall: the homepage demo (about a minute)
 *   social  SocialCut: the short vertical cut for Reels, Shorts and TikTok
 *   tour    FullTour: one job end to end, with the extra features
 *
 * Pure data, like ./demo-script (which builds each video's timeline from
 * it): no remotion, React or browser imports.
 *
 * Each line is one spoken sentence or clause and one burned-in caption.
 * `say` is what the voice reads; it differs from `show` only where the
 * spoken form needs spelling out ("Tradies 2 Quote", "fifteen percent",
 * "G S T", "Q R"). Timings are not written here:
 * scripts/make-demo-voiceover.mjs speaks every line, measures it and writes
 * ./demo-voiceover-timing.ts, so each chapter lasts exactly as long as its
 * voice needs.
 *
 * Claims must stay true to the app and the site's own wording (your rates,
 * 15% GST, the client signs on their phone, 7 days free with no card).
 * Re-run the script after any change here; never hand-edit the timing file.
 */

export type VoiceChapterId =
  | "hook"
  | "intro"
  | "request"
  | "talk"
  | "draft"
  | "supplier"
  | "check"
  | "send"
  | "timesheet"
  | "invoice"
  | "end";

export type VoiceoverId = "demo" | "social" | "tour";

export interface VoiceLine {
  say: string;
  show: string;
}

export interface VoiceChapter {
  id: VoiceChapterId;
  lines: readonly VoiceLine[];
}

/** The voice: Kokoro-82M (Apache-2.0), one of its American English voices. */
export const VOICE = { engine: "kokoro", voice: "af_heart", speed: 1.0 } as const;

/** Seconds of quiet before a chapter's first line, between lines, and after its last. */
export const VOICE_PACING = {
  demo: { leadIn: 0.45, gap: 0.3, tail: 0.6 },
  social: { leadIn: 0.25, gap: 0.2, tail: 0.35 },
  tour: { leadIn: 0.45, gap: 0.3, tail: 0.6 },
} as const satisfies Record<VoiceoverId, { leadIn: number; gap: number; tail: number }>;

/** Chapters never get shorter than this, so the screens have time to play. */
const STEP_MIN = { demo: 6, social: 3, tour: 6 } as const;
export function minChapterSeconds(video: VoiceoverId, chapter: VoiceChapterId): number {
  if (chapter === "intro" || chapter === "end") return video === "social" ? 3 : 4;
  if (chapter === "hook") return 2.4;
  return STEP_MIN[video];
}

const same = (text: string): VoiceLine => ({ say: text, show: text });
const brand = (text: string): VoiceLine => ({ say: text.replaceAll("Tradies2Quote", "Tradies 2 Quote"), show: text });

const TALK: readonly VoiceLine[] = [
  same("Start by talking through the job, the way you'd explain it to a mate."),
  same("Sizes, materials and labour, in your own words."),
  same("Then check what it heard. Sizes and amounts are highlighted, so a slip is easy to spot."),
];
const DRAFT: readonly VoiceLine[] = [
  brand("Tradies2Quote writes it up as a draft quote, using your own rates."),
  {
    say: "Materials, labour and fifteen percent G S T, all laid out line by line, with the total worked out for you.",
    show: "Materials, labour and 15% GST, all laid out line by line, with the total worked out for you.",
  },
];
const CHECK: readonly VoiceLine[] = [
  same("Nothing goes anywhere until you've checked it."),
  same("Tap any line to change the hours or the rate."),
  same("You always have the final say."),
];
const SEND: readonly VoiceLine[] = [
  same("When it's right, send it by email."),
  same("Your client opens the quote on their phone, reads every line, and accepts it with their name and a signature."),
  same("No printing, no scanning, no chasing."),
];
const INVOICE: readonly VoiceLine[] = [
  same("Once the job's done, turn that yes into an invoice in a couple of taps."),
  same("Send a reminder if you need to, and mark it paid when the money lands."),
];

export const NARRATIONS: Readonly<Record<VoiceoverId, readonly VoiceChapter[]>> = {
  demo: [
    {
      id: "intro",
      lines: [
        brand("Meet Tradies2Quote."),
        same("It turns a walk around the site into a professional quote, and that quote into a paid invoice, all from your phone."),
      ],
    },
    { id: "talk", lines: TALK },
    { id: "draft", lines: DRAFT },
    { id: "check", lines: CHECK },
    { id: "send", lines: SEND },
    { id: "invoice", lines: INVOICE },
    {
      id: "end",
      lines: [
        same("Quote the job before you leave the site."),
        { say: "Try it free for seven days. No card needed.", show: "Try it free for 7 days. No card needed." },
      ],
    },
  ],

  social: [
    { id: "hook", lines: [same("Quote the job before you leave the site.")] },
    { id: "talk", lines: [same("Talk through the job on site.")] },
    { id: "draft", lines: [brand("Tradies2Quote drafts the quote, using your own rates.")] },
    { id: "check", lines: [same("Check every line. You have the final say.")] },
    { id: "send", lines: [same("Your client signs on their phone.")] },
    { id: "invoice", lines: [same("Then invoice it, and get paid.")] },
    {
      id: "end",
      lines: [
        { say: "Try it free for seven days.", show: "Try it free for 7 days." },
        { say: "At Tradies 2 Quote dot com.", show: "tradies2quote.com" },
      ],
    },
  ],

  tour: [
    {
      id: "intro",
      lines: [
        brand("Here's a full tour of Tradies2Quote."),
        same("One job, from the first enquiry to a paid invoice, all from your phone."),
      ],
    },
    {
      id: "request",
      lines: [
        {
          say: "It starts with a new enquiry. Put your Q R code on the van, or on the site fence.",
          show: "It starts with a new enquiry. Put your QR code on the van, or on the site fence.",
        },
        same("A client scans it and describes the job, and their request arrives as a draft, ready for you to review."),
      ],
    },
    { id: "talk", lines: TALK },
    { id: "draft", lines: DRAFT },
    {
      id: "supplier",
      lines: [
        same("Got a quote from the trade counter? Take a photo of it."),
        brand("Tradies2Quote reads the lines and prices, so you can check them and add them to your price list."),
      ],
    },
    { id: "check", lines: CHECK },
    { id: "send", lines: SEND },
    {
      id: "timesheet",
      lines: [
        same("On the job, track your hours against each client."),
        same("Finish work with a tap, and invoice the week's hours in one go."),
      ],
    },
    { id: "invoice", lines: INVOICE },
    {
      id: "end",
      lines: [
        same("Quote the job before you leave the site."),
        { say: "Try it free for seven days, at Tradies 2 Quote dot com.", show: "Try it free for 7 days, at tradies2quote.com." },
      ],
    },
  ],
};

/** The homepage demo's narration (kept as its own name for the site's imports). */
export const NARRATION = NARRATIONS.demo;
