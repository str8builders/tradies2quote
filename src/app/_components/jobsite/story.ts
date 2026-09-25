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

/** The five steps of the job, as the chapter jump links. */
export const STEPS = [
  { anchor: "talk", label: "Talk" },
  { anchor: "draft", label: "Draft" },
  { anchor: "check", label: "Check" },
  { anchor: "send", label: "Send" },
  { anchor: "invoice", label: "Invoice" },
] as const;

export const HERO = {
  eyebrow: "Built on site. Made for the trades.",
  title: ["Great at the job.", "Done with the paperwork."],
  lede: "Talk through the job on site. Tradies2Quote writes it up as a professional quote with your rates and 15% GST. You check every line, send it, and get your evenings back.",
} as const;

export const PORTAL_LINE = "Voice in. Quote out.";

export const TALK = {
  title: "Talk",
  kicker: "The part you’re already good at.",
  what: "Tradies2Quote turns your site notes into professional quotes and invoices with AI, built in New Zealand for the trades.",
  ways: [
    { name: "Talk", body: "Record a walkthrough while you’re on site." },
    { name: "Type", body: "A few lines about the job is enough." },
    { name: "Photograph a plan", body: "It reads the dimensions off the drawing." },
  ],
  qr: {
    title: "Clients can ask you for a quote",
    body: "Put your QR code on the van or the site fence. Clients scan it, describe the job and add photos, and it lands as a draft for you to check.",
  },
  founder: {
    quote: "I built this for myself first because I was sick of losing Sundays to quoting.",
    name: "Challis Samu",
    role: "Qualified builder, Tauranga",
    initials: "CS",
  },
} as const;

export const QUOTE = {
  title: "Quote",
  kicker: "Your words in. A proper quote out.",
  draft: {
    title: "The draft builds itself",
    body: "What you said becomes line items: materials, labour and GST, line by line.",
  },
  supplier: {
    title: "Photograph your supplier’s quote",
    body: "Snap the quote from your merchant and its lines drop straight into your materials, ready to check.",
  },
  check: {
    title: "Your scope. Your rates. Your final say.",
    body: "Go through every line, change any figure, add or remove items. Nothing is sent until you send it. The AI drafts; you decide.",
  },
  numbers: {
    title: "Know your numbers",
    body: "Materials, labour, your markup and 15% GST add up to the total, to the cent.",
  },
  t2qcal: {
    title: "T2QCAL: 95 construction calculators",
    body: "Calculators that draw the job as you type: rafters, stairs, decks, framing and more. Measure lengths, areas and roof pitch from a photo. NZS 3604 and B1 Structure sit alongside every calculator.",
  },
} as const;

export const PAID = {
  title: "Paid",
  kicker: "The day’s paperwork, done.",
  send: {
    title: "Send it from your phone",
    body: "Your branded quote goes to the client by email, with a link to view it.",
  },
  sign: {
    title: "Signed on their phone",
    body: "The client reads it, signs with a finger and accepts. You get a notification when they do.",
  },
  invoice: {
    title: "Invoice in a tap",
    body: "When the job’s done, turn the accepted quote into an invoice with one tap. Mark it paid when the money lands.",
  },
  together: {
    title: "Keep it all together",
    body: "Clients, your material prices, quotes, invoices and the job calendar, in one place.",
  },
  pricing: {
    title: "Straight-up pricing",
    note: "NZD a month, GST inclusive",
  },
} as const;

export const TOOLS_DOWN = {
  title: "Tools down. Quote sent.",
  body: "Stop losing your evenings and Sundays to paperwork.",
  help: "Questions? A real person answers.",
} as const;

export const PROOF = [
  { value: "95", label: "construction calculators" },
  { value: "7", label: "days free, no card" },
  { value: "15%", label: "GST built in" },
  { value: "6", label: "trades" },
] as const;
