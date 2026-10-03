/**
 * The narration of the homepage demo (DemoWide, DemoTall): what the voice
 * says, and the caption shown while it says it.
 *
 * Pure data, like ./demo-script (which builds the demo's timeline from it):
 * no remotion, React or browser imports.
 *
 * Each line is one spoken sentence or clause and one burned-in caption.
 * `say` is what the voice reads; it differs from `show` only where the
 * spoken form needs spelling out ("Tradies 2 Quote", "fifteen percent").
 * Timings are not written here: scripts/make-demo-voiceover.mjs speaks every
 * line, measures it and writes ./demo-voiceover-timing.ts, so the chapters
 * last exactly as long as the voice needs.
 *
 * Claims must stay true to the app (the site's own wording: your rates, 15%
 * GST, the client signs on their phone, 7 days free with no card). Re-run
 * the script after any change here; never hand-edit the timing file.
 */

export type VoiceChapterId = "intro" | "talk" | "draft" | "check" | "send" | "invoice" | "end";

export interface VoiceLine {
  say: string;
  show: string;
}

/** The voice: Kokoro-82M (Apache-2.0), one of its American English voices. */
export const VOICE = { engine: "kokoro", voice: "af_heart", speed: 1.0 } as const;

/** Seconds of quiet before a chapter's first line, between lines, and after its last. */
export const VOICE_PACING = { leadIn: 0.45, gap: 0.3, tail: 0.6 } as const;

/** Chapters never get shorter than this, so the screens have time to play. */
export const MIN_CHAPTER_SECONDS: Readonly<Record<VoiceChapterId, number>> = {
  intro: 4,
  talk: 6,
  draft: 6,
  check: 6,
  send: 6,
  invoice: 6,
  end: 4,
};

const same = (text: string): VoiceLine => ({ say: text, show: text });

export const NARRATION: ReadonlyArray<{ id: VoiceChapterId; lines: readonly VoiceLine[] }> = [
  {
    id: "intro",
    lines: [
      { say: "Meet Tradies 2 Quote.", show: "Meet Tradies2Quote." },
      same("It turns a walk around the site into a professional quote, and that quote into a paid invoice, all from your phone."),
    ],
  },
  {
    id: "talk",
    lines: [
      same("Start by talking through the job, the way you'd explain it to a mate."),
      same("Sizes, materials and labour, in your own words."),
      same("Then check what it heard. Sizes and amounts are highlighted, so a slip is easy to spot."),
    ],
  },
  {
    id: "draft",
    lines: [
      { say: "Tradies 2 Quote writes it up as a draft quote, using your own rates.", show: "Tradies2Quote writes it up as a draft quote, using your own rates." },
      {
        say: "Materials, labour and fifteen percent G S T, all laid out line by line, with the total worked out for you.",
        show: "Materials, labour and 15% GST, all laid out line by line, with the total worked out for you.",
      },
    ],
  },
  {
    id: "check",
    lines: [
      same("Nothing goes anywhere until you've checked it."),
      same("Tap any line to change the hours or the rate."),
      same("You always have the final say."),
    ],
  },
  {
    id: "send",
    lines: [
      same("When it's right, send it by email."),
      same("Your client opens the quote on their phone, reads every line, and accepts it with their name and a signature."),
      same("No printing, no scanning, no chasing."),
    ],
  },
  {
    id: "invoice",
    lines: [
      same("Once the job's done, turn that yes into an invoice in a couple of taps."),
      same("Send a reminder if you need to, and mark it paid when the money lands."),
    ],
  },
  {
    id: "end",
    lines: [
      same("Quote the job before you leave the site."),
      { say: "Try it free for seven days. No card needed.", show: "Try it free for 7 days. No card needed." },
    ],
  },
];
