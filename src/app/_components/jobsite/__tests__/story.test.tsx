import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PLANS } from "@/lib/plans";
import { FAQS } from "../../landing/FAQ";
import { JobSiteStory } from "../JobSiteStory";
import { COMING_SOON, EXAMPLE_LABEL, FEATURES, FILMED_ON, FINISHED, ROOMS, STEPS, T2QCAL_STOP } from "../story";

const html = renderToStaticMarkup(<JobSiteStory nativeShell={false} />);
const text = html
  .replace(/<[^>]+>/g, " ")
  .replace(/&#x27;|&#39;/g, "'")
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ");

describe("the job-site story is complete as plain HTML (search, screen readers, still version)", () => {
  it("has one headline, a heading for every room, feature and T2QCAL, and the finished home", () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(text).toContain("Great at the job.");
    expect(text).toContain("Done with the paperwork.");
    const words = [...ROOMS.map((r) => r.word), ...FEATURES.map((f) => f.word), T2QCAL_STOP.word, "Tools down. Quote sent."];
    for (const word of words) {
      expect(html).toMatch(new RegExp(`<h2[^>]*>${word.replace(/\./g, "\\.")}</h2>`));
    }
  });

  it("walks the house in the job's order, then the app's other features and T2QCAL; the step links land on the rooms", () => {
    expect(ROOMS.map((r) => r.id)).toEqual(["talk", "draft", "check", "send", "invoice"]);
    expect(STEPS.map((s) => s.anchor)).toEqual(ROOMS.map((r) => r.id));
    const stops = [...ROOMS.map((r) => r.id), ...FEATURES.map((f) => f.id), T2QCAL_STOP.id];
    const at = stops.map((id) => html.indexOf(`id="${id}"`));
    expect(at.every((i) => i > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    const scenes = ["site", "portal", "house", "details"].map((id) => html.indexOf(`data-scene="${id}"`));
    expect(scenes.every((i) => i > 0)).toBe(true);
    expect([...scenes].sort((a, b) => a - b)).toEqual(scenes);
  });

  it("each room says what the step does, with its app screen labelled as example figures", () => {
    for (const room of ROOMS) {
      expect(text).toContain(room.bold);
      expect(text).toContain(room.body);
      expect(html).toContain(`alt="${room.screenAlt}"`);
    }
    expect(text.split(EXAMPLE_LABEL).length - 1).toBe(ROOMS.length + FEATURES.length + 1);
    expect(text).toContain(FILMED_ON);
    expect(html).toContain(`alt="${FINISHED.photoAlt}"`);
  });

  it("every room, feature and T2QCAL has a slot for the floating phone, naming its screen", () => {
    const clips = [...ROOMS.map((r) => r.id), ...FEATURES.map((f) => f.id), T2QCAL_STOP.id];
    expect(html.match(/data-phone-slot/g)).toHaveLength(clips.length);
    for (const clip of clips) {
      expect(html).toContain(`data-clip="${clip}"`);
      expect(html).toContain(`jobsite%2Fscreens%2F${clip}.webp`);
    }
    // The step links (Talk … Invoice) end where "More in the app" begins.
    expect(html.match(/data-steps-end/g)).toHaveLength(1);
    expect(html.indexOf("data-steps-end")).toBeGreaterThan(html.indexOf('id="invoice"'));
  });

  it("says what each feature and T2QCAL does, in wording the code backs up", () => {
    for (const feature of FEATURES) {
      expect(text).toContain(feature.bold);
      expect(text).toContain(feature.body);
      expect(html).toContain(`alt="${feature.screenAlt}"`);
      expect(feature.word.length).toBeLessThanOrEqual(7);
    }
    expect(text).toContain(T2QCAL_STOP.body);
    for (const item of T2QCAL_STOP.inside) expect(text).toContain(item);
    // The QR code leads (in the barcode's old place): printed from the app for
    // the van, as Your QR code does. The barcode and the quote video are gone
    // from the site at the owner's request (the video is off in the app too).
    expect(FEATURES[0].id).toBe("request");
    expect(text).toContain("as a sticker for the van");
    expect(text).not.toMatch(/barcode|quote video|15-second video/i);
    // The T2QCAL hand-off makes a draft (the tradie reviews it), with the working attached.
    expect(text).toContain("puts the order quantities into a Tradies2Quote draft, with your working attached");
    // The phone plays the iPhone app, which isn't on the App Store yet: the page says so.
    expect(text).toContain(T2QCAL_STOP.availability);
    expect(text).not.toMatch(/download (it )?on the app store|get it on the app store/i);
    // Features that are off, or only in the unreleased iPhone app (automatic
    // clock-in, travel km from the background route), aren't offered as live.
    const live = [...FEATURES.map((f) => `${f.bold} ${f.body}`), T2QCAL_STOP.body, ...T2QCAL_STOP.inside].join(" ");
    expect(live).not.toMatch(/automatic|kilomet|\bkm\b|deposit|pay online|plan reader|follow-up|team|crew/i);
    // Timesheets are in the new look, which everyone on the web has.
    expect(FEATURES.map((f) => f.id)).toContain("timesheet");
    expect(text).toContain(`${COMING_SOON.tag} ${COMING_SOON.title}`);
  });

  it("shows the real plans and prices, in the app's own wording", () => {
    for (const plan of Object.values(PLANS)) {
      expect(text).toContain(plan.name);
      expect(text).toContain(`$${plan.price}`);
    }
    expect(text).toContain("NZD a month, GST inclusive");
    expect(text).toContain("7 days free, no card");
    expect(text).toContain("95 construction calculators");
  });

  it("answers every FAQ and keeps the FAQ search data", () => {
    for (const item of FAQS) expect(text).toContain(item.q);
    expect(html).toContain('"@type":"FAQPage"');
  });

  it("tells Google the site's name and logo, so results show Tradies2Quote and its icon", () => {
    expect(html).toContain('"@type":"WebSite","@id":"https://tradies2quote.com/#website","name":"Tradies2Quote"');
    expect(html).toContain('"logo":"https://tradies2quote.com/icon-512.png"');
    expect(existsSync(join(process.cwd(), "public", "icon-512.png"))).toBe(true);
    expect(text).toContain("support@tradies2quote.com");
  });

  it("never marks a room's still image as high priority — the house is several screens below the hero", () => {
    // talk.jpg (the first room) used to preload at fetchpriority="high"
    // despite being well below the fold; next/image only emits the
    // attribute when `priority` is set, so its absence proves the prop is gone.
    expect(html).not.toMatch(/fetchpriority="high"/);
  });

  it("makes no claim the app can't back up", () => {
    expect(text).not.toMatch(/60 seconds|under a minute/i);
    expect(text).not.toMatch(/testimonial|trusted by \d|\d+\+? tradies use/i);
    // Invoices are marked paid by the tradie; the app doesn't collect them.
    expect(text).toContain("Mark it paid when the money lands.");
    expect(text).not.toMatch(/paid (online|in the app)|pay (the|your) invoice online/i);
  });
});

describe("inside the iOS App Store shell (3.1.3(f))", () => {
  const shell = renderToStaticMarkup(<JobSiteStory nativeShell />);
  it("no tier prices, no FAQ, no T2QCAL link, no search data", () => {
    for (const plan of Object.values(PLANS)) expect(shell).not.toContain(`$${plan.price}`);
    expect(shell).not.toContain('id="faq"');
    expect(shell).not.toContain('href="/t2qcal"');
    expect(shell).not.toContain("application/ld+json");
  });
});

describe("every picture and clip the rooms point at is in public/jobsite", () => {
  const file = (p: string) => existsSync(join(process.cwd(), "public", p));
  it("clips (computer and phone cuts), stills, first frames, screens and photos", () => {
    for (const room of ROOMS) {
      // The phone's screen for the step: the clip for computers and phones,
      // its first frame (shown until the clip has one) and the finished screen.
      for (const f of [`${room.id}-600.mp4`, `${room.id}-420.mp4`, `${room.id}-first.webp`, `${room.id}.webp`]) {
        expect(file(`jobsite/screens/${f}`), f).toBe(true);
      }
      if (room.media.kind === "clip") {
        for (const f of [`${room.id}-720.mp4`, `${room.id}-540.mp4`, `${room.id}.jpg`, `${room.id}-first.jpg`]) {
          expect(file(`jobsite/rooms/${f}`), f).toBe(true);
        }
      } else {
        expect(file(room.media.src.slice(1)), room.media.src).toBe(true);
      }
    }
    expect(file(FINISHED.photo.slice(1))).toBe(true);
    for (const clip of [...FEATURES.map((f) => f.id), T2QCAL_STOP.id]) {
      for (const f of [`${clip}-600.mp4`, `${clip}-420.mp4`, `${clip}-first.webp`, `${clip}.webp`]) {
        expect(file(`jobsite/screens/${f}`), f).toBe(true);
      }
    }
  });
});
