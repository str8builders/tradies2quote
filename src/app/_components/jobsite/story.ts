/**
 * Every line on the job-site website, in one place.
 *
 * Wording was checked against the app on 26 Sep 2026 (see the plan): only
 * true claims, in the app's own terms. Things the app doesn't do or hasn't
 * measured stay out: no "under 60 seconds" (not yet timed on real quotes),
 * and no suggestion the app collects invoice payments (you mark them paid).
 * Prices and plan features come from src/lib/plans.ts, not from here.
 */

export const TRIAL_LINE = "7 days free, no card";

export const TRADES = ["Builders", "Plumbers", "Sparkies", "Painters", "Landscapers", "Roofers"] as const;

export const HERO = {
  eyebrow: "AI quotes and invoices for NZ tradies",
  /** The brief's second line, shown in the air as the camera walks the frame. */
  caption: "Built on site. Made for the trades.",
  title: ["Great at the job.", "Done with the paperwork."],
  lede: "Talk through the job on site. Tradies2Quote writes it up as a professional quote with your rates and 15% GST. You check every line, send it, and get your evenings back.",
} as const;

/** The owner confirmed the footage and photos are one of his builds (26 Sep 2026). */
export const FILMED_ON = "Filmed on one of our builds in Tauranga.";

/** The phone screens are the 30-second demo's, with its example job. */
export const EXAMPLE_LABEL = "Example job · example figures";

export type RoomId = "talk" | "draft" | "check" | "send" | "invoice";

export type Room = {
  id: RoomId;
  word: string;
  bold: string;
  body: string;
  /** A clip from the walkthrough (public/jobsite/rooms/<id>-*), or a photo of the finished home. */
  media: { kind: "clip" } | { kind: "photo"; src: string; alt: string };
  screenAlt: string;
};

/**
 * Inside the house: one room per step of the job, in order. These ids are
 * also the step links (Talk → Draft → Check → Send → Invoice).
 */
export const ROOMS: readonly Room[] = [
  {
    id: "talk",
    word: "Talk",
    bold: "Walk the job. Talk it through.",
    body: "Record a walkthrough on site, type a few lines, or photograph a plan. Clients can ask you for a quote from your QR code on the van or the site fence.",
    media: { kind: "clip" },
    screenAlt: "The app reading the site note back before it writes the quote",
  },
  {
    id: "draft",
    word: "Draft",
    bold: "The quote writes itself.",
    body: "What you said becomes line items: materials, labour and GST, line by line. Photograph your supplier’s quote and its lines drop straight into your materials.",
    media: { kind: "clip" },
    screenAlt: "The draft quote: the total and the price breakdown",
  },
  {
    id: "check",
    word: "Check",
    bold: "Your rates. Your final say.",
    body: "Go through every line and change any figure. Nothing is sent until you send it. The AI drafts; you decide.",
    media: { kind: "clip" },
    screenAlt: "Changing the labour line before the quote goes",
  },
  {
    id: "send",
    word: "Send",
    bold: "Signed on their phone.",
    body: "Your branded quote goes to the client by email, with a link to view it. They read it, sign with a finger and accept, and you get a notification.",
    media: { kind: "clip" },
    screenAlt: "The client signing the quote with a finger",
  },
  {
    id: "invoice",
    word: "Invoice",
    bold: "Invoice in a tap.",
    body: "When the job’s done, the accepted quote becomes the invoice with one tap. Mark it paid when the money lands. Clients, prices, quotes, invoices and your job calendar stay in one place.",
    media: {
      kind: "photo",
      src: "/jobsite/finished-front.jpg",
      alt: "The finished front entry: stacked stone, vertical cedar cladding and a timber step",
    },
    screenAlt: "The invoice, marked paid",
  },
];

export const FINISHED = {
  title: "Tools down. Quote sent.",
  body: "Stop losing your evenings and Sundays to paperwork.",
  photo: "/jobsite/finished-deck.jpg",
  photoAlt: "The finished home: a kwila deck, bifold doors and a glass gable",
} as const;

export const FOUNDER = {
  quote: "I built this for myself first because I was sick of losing Sundays to quoting.",
  name: "Challis Samu",
  role: "Qualified builder, Tauranga",
  initials: "CS",
} as const;

export const T2QCAL = {
  title: "T2QCAL: 95 construction calculators",
  body: "Calculators that draw the job as you type: rafters, stairs, decks, framing and more. Measure lengths, areas and roof pitch from a photo. NZS 3604 and B1 Structure sit alongside every calculator.",
} as const;

export const PRICING = {
  title: "Straight-up pricing",
  note: "NZD a month, GST inclusive",
} as const;

export const HELP_LINE = "Questions? A real person answers.";

export const PROOF = [
  { value: "95", label: "construction calculators" },
  { value: "7", label: "days free, no card" },
  { value: "15%", label: "GST built in" },
  { value: "6", label: "trades" },
] as const;

/** The step links follow the rooms. */
export const STEPS = ROOMS.map((r) => ({ anchor: r.id, label: r.word }));
