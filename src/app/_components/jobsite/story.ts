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

export type FeatureId = "barcode" | "supplier" | "request" | "video" | "timesheet";

export type Feature = {
  id: FeatureId;
  /** The big word (seven letters at most, like the rooms'). */
  word: string;
  bold: string;
  body: string;
  screenAlt: string;
};

/**
 * "More in the app": features every new sign-up can use today, each played on
 * the phone (src/remotion/marketing/feature-screen.tsx). Checked against the
 * code on 27 Sep 2026: the barcode looks up the tradie's own price list only;
 * supplier quotes take photos (several pages) or a PDF and nothing is saved
 * until the tradie checks the lines; a QR request makes the client and a
 * filled-in draft and notifies the tradie; the quote video is the 15-second
 * video at the top of the client's quote link. The timesheet is in the new
 * look, which everyone on the web has had since 27 Sep 2026
 * (T2Q_NEW_LOOK_DEFAULT=on): Start work / Finish work, pinned to the job
 * when location's on, and "Invoice this week" at the labour rate. Travel km
 * are recorded only while location is on and the route is being sent (on
 * the web, while the Timesheet page is open; the iPhone app, roughly, even
 * when closed), so the web feature doesn't promise them.
 */
export const FEATURES: readonly Feature[] = [
  {
    id: "barcode",
    word: "Barcode",
    bold: "Scan it onto the quote.",
    body: "Point your phone at a product’s barcode, or take a photo of it. The app finds it in your own prices and adds it to the quote at your price. New to you? Name and price it once and the barcode’s saved with it.",
    screenAlt: "Scanning a box of stainless deck screws: found in your library at $45.00 a box and added to the quote",
  },
  {
    id: "supplier",
    word: "Scan",
    bold: "Photograph the supplier’s quote.",
    body: "Snap your supplier’s quote, a few pages if you need, or upload the PDF. The lines come off the paper into your prices or straight into a new quote, and you check every line first. Price lists import from CSV, Excel, PDF or a photo.",
    screenAlt: "A supplier’s quote photographed and read into three lines: decking boards, deck screws and joist hangers, $2,640.00",
  },
  {
    id: "request",
    word: "QR code",
    bold: "Clients ask. The draft’s waiting.",
    body: "Put your QR code on the van, the site fence or a flyer. Clients scan it and tell you what they need, no account needed. You get a notification and a draft quote ready to check. Print the poster from the app.",
    screenAlt: "A client’s quote request from the QR code, then the tradie’s phone: new request from Sam Taylor, draft ready to review",
  },
  {
    id: "video",
    word: "Video",
    bold: "A quote they’ll actually watch.",
    body: "Turn a quote into a 15-second video: your logo, the job, the main items and the total, ending on tap to accept. It plays at the top of your client’s quote link.",
    screenAlt: "The client’s quote link playing the 15-second quote video, ending on the $4,830.00 total and tap the link to accept",
  },
  {
    id: "timesheet",
    word: "Hours",
    bold: "Clock in on site. Invoice the week.",
    body: "Tap Start work when you get there and Finish work when you’re done. Your hours land on the timesheet, pinned to the job when location’s on. At the end of the week, pick the client and the week’s hours become an invoice at your labour rate, a line a day.",
    screenAlt: "The timesheet: finishing work at the Sam Taylor job with a 30-minute break, 7.75 hours logged, then invoicing the week for $579.31",
  },
];

/** Only the iPhone app does this (region monitoring runs in the app), and that app isn't public yet. */
export const COMING_SOON = {
  tag: "Coming to the iPhone app",
  // A non-breaking hyphen, so a narrow screen never splits "clock-in".
  title: "Automatic clock\u2011in",
  body: "Your hours start when you arrive at a job and stop when you leave, in your work hours only, with the kilometres you drive ready to go on the invoice.",
} as const;

/**
 * T2QCAL, free and public (calculators, Measure and the guides work signed
 * out; saving and sending to a quote need a Tradies2Quote login). "Use in
 * Tradies2Quote" makes a draft quote with one material line from the result
 * and the working attached (src/t2qcal/lib/quote-handoff.ts).
 */
export const T2QCAL_STOP = {
  id: "t2qcal",
  word: "T2QCAL",
  eyebrow: "Free calculator app · works with Tradies2Quote",
  bold: "Work it out. Send it to the quote.",
  body: "95 construction calculators that draw the job as you type: decks, stairs, roofs, concrete, framing and more. When the numbers are right, Use in Tradies2Quote turns the result into a draft quote, with your working attached.",
  inside: [
    "95 calculators in 10 groups",
    "Measure: level, heights, photo measure, 3D room scan",
    "Take-offs from PDF plans",
    "NZ standards and guides, a tap away",
    "Free to use, no sign-up to calculate",
  ],
  screenAlt: "T2QCAL working out a deck and drawing it, then Use in Tradies2Quote making a draft quote with the working attached",
} as const;

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
  body: "Calculators that draw the job as you type: rafters, stairs, decks, framing and more. Measure lengths, areas and roof pitch from a photo, with the NZ standards and guides that apply a tap away.",
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
