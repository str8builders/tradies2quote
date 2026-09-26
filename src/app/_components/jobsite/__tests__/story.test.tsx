import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PLANS } from "@/lib/plans";
import { FAQS } from "../../landing/FAQ";
import { JobSiteStory } from "../JobSiteStory";
import { EXAMPLE_LABEL, FILMED_ON, FINISHED, ROOMS, STEPS } from "../story";

const html = renderToStaticMarkup(<JobSiteStory nativeShell={false} />);
const text = html
  .replace(/<[^>]+>/g, " ")
  .replace(/&#x27;|&#39;/g, "'")
  .replace(/&amp;/g, "&")
  .replace(/\s+/g, " ");

describe("the job-site story is complete as plain HTML (search, screen readers, still version)", () => {
  it("has one headline, a heading for every room, and the finished home", () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(text).toContain("Great at the job.");
    expect(text).toContain("Done with the paperwork.");
    for (const word of [...ROOMS.map((r) => r.word), "Tools down. Quote sent."]) {
      expect(html).toMatch(new RegExp(`<h2[^>]*>${word.replace(/\./g, "\\.")}</h2>`));
    }
  });

  it("walks the house in the job's order, and every step link lands on its room", () => {
    expect(ROOMS.map((r) => r.id)).toEqual(["talk", "draft", "check", "send", "invoice"]);
    expect(STEPS.map((s) => s.anchor)).toEqual(ROOMS.map((r) => r.id));
    const at = ROOMS.map((r) => html.indexOf(`id="${r.id}"`));
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
    expect(text.split(EXAMPLE_LABEL).length - 1).toBe(ROOMS.length);
    expect(text).toContain(FILMED_ON);
    expect(html).toContain(`alt="${FINISHED.photoAlt}"`);
  });

  it("every room has a slot for the floating phone, holding that step's finished screen", () => {
    expect(html.match(/data-phone-slot/g)).toHaveLength(ROOMS.length);
    for (const room of ROOMS) expect(html).toContain(`jobsite%2Fscreens%2F${room.id}.webp`);
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
    expect(text).toContain("support@tradies2quote.com");
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
  });
});
