/**
 * Single source of truth for the marketing videos: the fictional example job,
 * the chapter timings of every composition and the burned-in captions.
 *
 * Pure data. The Remotion compositions AND the website (chapter buttons, the
 * visually hidden transcript) import this module, so it must never import
 * remotion, React or anything browser-only.
 *
 * Privacy rule for marketing visuals: no real people, client or business
 * names, usernames or real figures. Everything below is invented.
 */

export const VIDEO_FPS = 30;

export type LineType = "material" | "labour";

export interface ExampleLine {
  id: string;
  type: LineType;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

const DECKING: ExampleLine = {
  id: "decking",
  type: "material",
  description: "Decking & fixings",
  quantity: 24,
  unit: "m²",
  unitPrice: 110,
  total: 2640,
};

const LABOUR: ExampleLine = {
  id: "labour",
  type: "labour",
  description: "Site preparation & installation",
  quantity: 24,
  unit: "hr",
  unitPrice: 65,
  total: 1560,
};

/** The one example used on every screen, in every video and still. */
export const EXAMPLE = {
  business: "Your Business",
  initials: "YB",
  client: "Sam Taylor",
  clientFirstName: "Sam",
  /** example.com is reserved for documentation; it can never be a real inbox. */
  clientEmail: "sam.taylor@example.com",
  job: "New timber deck, 24 m²",
  jobSummary: "New timber deck, 24 m², off the back of the house.",
  quoteNumber: "Q-2026-A41C",
  invoiceNumber: "INV-0042",
  currency: "NZD",
  issued: "23 Sep 2026",
  validUntil: "23 Oct 2026",
  accepted: "24 Sep 2026",
  paid: "8 Oct 2026",
  gstRate: 15,
  markupPct: 0,
  lines: [DECKING, LABOUR] as const,
  /**
   * The AI draft: 26 hr at the default $60.00. In "Check every line" the
   * tradie corrects it to 24 hr at their own $65.00. Both come to $1,560.00,
   * so the draft and the reviewed quote both total $4,830.00.
   */
  draftLabour: { quantity: 26, unitPrice: 60 },
  materialsSubtotal: 2640,
  labourSubtotal: 1560,
  markup: 0,
  subtotal: 4200,
  gst: 630,
  total: 4830,
  /** Deck measured in the T2QCAL companion calculator (FullTour). */
  deck: { length: 6, width: 4, area: 24 },
  /** What the tradie says on site; revealed word by word in "Talk the job". */
  transcript:
    "New timber deck for Sam Taylor, 24 square metres off the back of the house. Decking and fixings, plus site prep and installation.",
  /** What the client types into the QR request form (FullTour). */
  request: "New timber deck off the back of the house, about 24 square metres.",
  /** Scanned supplier quote (feature still). Sums to the $2,640.00 materials line. */
  supplierLines: [
    { description: "Decking boards 140×32", quantity: 24, unit: "m²", unitPrice: 95, total: 2280 },
    { description: "Stainless deck screws", quantity: 4, unit: "box", unitPrice: 45, total: 180 },
    { description: "Joist hangers & brackets", quantity: 1, unit: "lot", unitPrice: 180, total: 180 },
  ],
  site: "tradies2quote.com",
  siteUrl: "https://tradies2quote.com",
  offer: "7 days free",
} as const;

/** Locale-independent money format, e.g. 4830 -> "$4,830.00". */
export function formatMoney(value: number): string {
  const cents = Math.round(value * 100);
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${dollars}.${String(abs % 100).padStart(2, "0")}`;
}

/** A line's total, always quantity × unit price rounded to cents (as the app does). */
export function lineTotal(quantity: number, unitPrice: number): number {
  return Math.round(quantity * unitPrice * 100) / 100;
}

/**
 * The labour line through "Check every line": the AI's draft, then the
 * tradie's two edits (hours, then rate). Every step shows its own correct
 * line total: $1,560.00, then $1,440.00 for a moment, then $1,560.00 again.
 * The quote total card is off screen during the middle step, so every quote
 * total the videos show is $4,830.00.
 */
export const LABOUR_EDIT_STEPS = [
  { step: "draft", quantity: EXAMPLE.draftLabour.quantity, unitPrice: EXAMPLE.draftLabour.unitPrice },
  { step: "hours", quantity: EXAMPLE.lines[1].quantity, unitPrice: EXAMPLE.draftLabour.unitPrice },
  { step: "rate", quantity: EXAMPLE.lines[1].quantity, unitPrice: EXAMPLE.lines[1].unitPrice },
] as const;

/* ─── Chapters and captions ──────────────────────────────────────────────── */

/** The five chapters of the core story, in order. */
export const CORE_CHAPTERS = ["talk", "draft", "check", "send", "invoice"] as const;
export type DemoChapterId = (typeof CORE_CHAPTERS)[number];

/** Every scene a composition can contain (core chapters plus extras). */
export type SceneId = DemoChapterId | "hook" | "intro" | "request" | "calculator" | "end";

export const SCENE_COPY: Record<SceneId, { label: string; title: string }> = {
  talk: { label: "Talk", title: "Talk the job" },
  draft: { label: "Draft", title: "Draft builds itself" },
  check: { label: "Check", title: "Check every line" },
  send: { label: "Send", title: "Send and get the yes" },
  invoice: { label: "Invoice", title: "Invoice and get paid" },
  request: { label: "Request", title: "The job comes to you" },
  calculator: { label: "Measure", title: "Measured, not guessed" },
  hook: { label: "Hook", title: "Quote the job before you leave the site" },
  intro: { label: "Intro", title: "One job, start to finish" },
  end: { label: "Start", title: "Try it on your next job" },
};

export interface TimelineChapter {
  id: SceneId;
  label: string;
  title: string;
  /** First frame of the chapter, in composition frames. */
  from: number;
  durationInFrames: number;
}

export interface Caption {
  chapter: SceneId;
  /** Inclusive first frame. */
  from: number;
  /** Exclusive last frame. */
  to: number;
  text: string;
}

export interface Timeline {
  id: string;
  fps: number;
  durationInFrames: number;
  chapters: TimelineChapter[];
  captions: Caption[];
}

type CaptionSpec = readonly [startSec: number, endSec: number, text: string];
interface ChapterSpec {
  id: SceneId;
  seconds: number;
  captions: readonly CaptionSpec[];
}

/** Lays chapters end to end; caption times are relative to their chapter. */
function buildTimeline(id: string, specs: readonly ChapterSpec[]): Timeline {
  const chapters: TimelineChapter[] = [];
  const captions: Caption[] = [];
  let cursor = 0;
  for (const spec of specs) {
    const durationInFrames = Math.round(spec.seconds * VIDEO_FPS);
    chapters.push({ id: spec.id, ...SCENE_COPY[spec.id], from: cursor, durationInFrames });
    for (const [start, end, text] of spec.captions) {
      captions.push({
        chapter: spec.id,
        from: cursor + Math.round(start * VIDEO_FPS),
        to: cursor + Math.round(end * VIDEO_FPS),
        text,
      });
    }
    cursor += durationInFrames;
  }
  return { id, fps: VIDEO_FPS, durationInFrames: cursor, chapters, captions };
}

/** DemoWide and DemoTall: the same 30-second story in two shapes. */
export const DEMO_TIMELINE = buildTimeline("demo", [
  {
    id: "talk",
    seconds: 6,
    captions: [
      [0.2, 3.3, "Walk the site and talk through the job."],
      [3.3, 5.9, "Your words become the starting point."],
    ],
  },
  {
    id: "draft",
    seconds: 6,
    captions: [
      [0.1, 3.3, "The draft quote builds itself."],
      [3.3, 5.9, "Materials, labour and GST, line by line."],
    ],
  },
  {
    id: "check",
    seconds: 6,
    captions: [
      [0.1, 3.3, "Check every line before it goes."],
      [3.3, 5.9, "Change any rate. You have the final say."],
    ],
  },
  {
    id: "send",
    seconds: 6,
    captions: [
      [0.1, 3.3, "Send it. Your client reads it on their phone,"],
      [3.3, 5.9, "accepts, and signs with a finger."],
    ],
  },
  {
    id: "invoice",
    seconds: 6,
    captions: [
      [0.1, 3.3, "Turn the yes into an invoice."],
      [3.3, 5.9, "Mark it paid when the money lands."],
    ],
  },
]);

/** SocialCut: 15-second vertical cut with a hook and an end card. */
export const SOCIAL_TIMELINE = buildTimeline("social", [
  { id: "hook", seconds: 2.2, captions: [[0, 2.2, "Quote the job before you leave the site."]] },
  { id: "talk", seconds: 2.4, captions: [[0, 2.4, "Talk the job on site."]] },
  { id: "draft", seconds: 2.4, captions: [[0, 2.4, "The quote drafts itself."]] },
  { id: "check", seconds: 2.0, captions: [[0, 2.0, "You check every line."]] },
  { id: "send", seconds: 2.6, captions: [[0, 2.6, "Your client signs on their phone."]] },
  { id: "invoice", seconds: 1.8, captions: [[0, 1.8, "Invoice it. Get paid."]] },
  { id: "end", seconds: 1.6, captions: [[0, 1.6, "tradies2quote.com · 7 days free"]] },
]);

/** FullTour: one job from the first enquiry to the paid invoice. */
export const TOUR_TIMELINE = buildTimeline("tour", [
  { id: "intro", seconds: 3, captions: [[0.3, 2.9, "One job, from the first enquiry to a paid invoice."]] },
  {
    id: "request",
    seconds: 8,
    captions: [
      [0.2, 4.4, "Clients scan your QR code and describe the job."],
      [4.4, 7.9, "It lands in your app as a draft, ready for you."],
    ],
  },
  {
    id: "talk",
    seconds: 7,
    captions: [
      [0.1, 3.9, "On site, talk through the job."],
      [3.9, 6.9, "Your words become the starting point."],
    ],
  },
  {
    id: "draft",
    seconds: 7,
    captions: [
      [0.1, 3.9, "The draft quote builds itself."],
      [3.9, 6.9, "Materials, labour and GST, line by line."],
    ],
  },
  {
    id: "calculator",
    seconds: 7,
    captions: [
      [0.1, 3.9, "Measure the deck in the T2QCAL calculator."],
      [3.9, 6.9, "The measured result becomes the quote line."],
    ],
  },
  {
    id: "check",
    seconds: 7,
    captions: [
      [0.1, 3.9, "Check every line before it goes."],
      [3.9, 6.9, "Change any rate. You have the final say."],
    ],
  },
  {
    id: "send",
    seconds: 8,
    captions: [
      [0.1, 4.4, "Send it. Your client reads it on their phone,"],
      [4.4, 7.9, "accepts, and signs with a finger."],
    ],
  },
  {
    id: "invoice",
    seconds: 7,
    captions: [
      [0.1, 3.9, "Turn the yes into an invoice."],
      [3.9, 6.9, "Mark it paid when the money lands."],
    ],
  },
  { id: "end", seconds: 6, captions: [[0.3, 5.8, "Try it free for 7 days at tradies2quote.com"]] },
]);

/** All caption text of one chapter, joined (title scenes show it large). */
export function chapterCaptionText(timeline: Timeline, chapter: SceneId): string {
  return timeline.captions
    .filter((c) => c.chapter === chapter)
    .map((c) => c.text)
    .join(" ");
}

/** HeroLoop: 9-second seamless loop, phone screen only, no captions. */
export const HERO_LOOP_FRAMES = 9 * VIDEO_FPS;

export const TIMELINES = {
  demo: DEMO_TIMELINE,
  social: SOCIAL_TIMELINE,
  tour: TOUR_TIMELINE,
} as const;

/** Chapter list for the website's chapter buttons (DemoWide / DemoTall). */
export const DEMO_CHAPTERS: ReadonlyArray<{ id: DemoChapterId; label: string; startSec: number }> =
  CORE_CHAPTERS.map((id) => {
    const chapter = DEMO_TIMELINE.chapters.find((c) => c.id === id);
    if (!chapter) throw new Error(`DEMO_TIMELINE is missing chapter ${id}`);
    return { id, label: chapter.label, startSec: chapter.from / VIDEO_FPS };
  });

/** Plain-text transcript of the demo captions, grouped by chapter. */
export const DEMO_TRANSCRIPT: ReadonlyArray<{ id: DemoChapterId; title: string; text: string }> =
  CORE_CHAPTERS.map((id) => ({
    id,
    title: SCENE_COPY[id].title,
    text: DEMO_TIMELINE.captions
      .filter((c) => c.chapter === id)
      .map((c) => c.text)
      .join(" "),
  }));

/** Text alternative for the silent hero loop. */
export const HERO_DESCRIPTION = `A tradie describes the job out loud. The words appear, two quote lines drop in and the total comes to ${formatMoney(
  EXAMPLE.total,
)} including GST, ready for their review. Example data.`;

/** Chapter active at a given time in seconds (for the website's buttons). */
export function demoChapterAt(seconds: number): DemoChapterId {
  let current: DemoChapterId = DEMO_CHAPTERS[0].id;
  for (const chapter of DEMO_CHAPTERS) {
    if (seconds + 1e-6 >= chapter.startSec) current = chapter.id;
  }
  return current;
}
