// The App Store submission pack (APP_STORE_REVIEW_NOTES.md) against the app.
// The App Store Compliance Playbook's two biggest causes of rejection are a
// reviewer who can't follow the notes and privacy answers that don't match
// the app. So: the notes fit App Store Connect's field, every button they
// name exists, and the privacy-label table says exactly what the app's
// privacy manifest says.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const pack = readFileSync(join(root, "APP_STORE_REVIEW_NOTES.md"), "utf8");
const manifest = readFileSync(join(root, "ios/App/App/PrivacyInfo.xcprivacy"), "utf8");

/** The paste-ready notes: the first fenced block after "### Notes". */
function notesBlock(): string {
  const start = pack.indexOf("### Notes");
  expect(start, "### Notes heading").toBeGreaterThan(-1);
  const open = pack.indexOf("```\n", start);
  const close = pack.indexOf("\n```", open + 4);
  return pack.slice(open + 4, close);
}

/** Every source file a label could live in (app code and the iPhone project), tests left out. */
function sources(): string {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === "node_modules" || name.startsWith(".")) continue;
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(tsx?|swift)$/.test(name) && !/\.test\./.test(name)) out.push(readFileSync(path, "utf8"));
    }
  };
  walk(join(root, "src"));
  walk(join(root, "ios/App"));
  return out.join("\n");
}

describe("the review notes", () => {
  const notes = notesBlock();

  it("fit App Store Connect's 4,000-character notes field", () => {
    expect([...notes].length).toBeLessThanOrEqual(4000);
    expect(notes).toContain("demo@tradies2quote.com");
  });

  it("name only buttons and screens the app really has", () => {
    const all = sources();
    const quoted = [...notes.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(quoted.length).toBeGreaterThan(10);
    const menu = ["Your profile", "Rates and quotes", "Your QR code", "Send feedback", "Privacy policy", "On this device", "Outdoor mode", "Text size", "Sign out", "Start work", "Finish work", "More tools", "Customer chat", "AI features", "Write my quote"];
    for (const label of [...quoted, ...menu]) expect(all.includes(label), label).toBe(true);
  });

  it("cover the native features the 4.2 review looks for, and the 2026 questions", () => {
    for (const words of ["Live Activity", "quick actions", "contact picker", "New Event sheet", "Text size", "EXTERNAL SERVICES", "3.1.3(f)", "5.1.2(i)"]) {
      expect(notes, words).toContain(words);
    }
    const flat = pack.replace(/\s+/g, " ");
    for (const question of ["Social media capabilities", "Age rating", "Content rights", "international format"]) {
      expect(flat, question).toContain(question);
    }
  });
});

describe("the privacy-label table matches PrivacyInfo.xcprivacy", () => {
  /** Manifest key (after NSPrivacyCollectedDataType) → the label's name in the table. */
  const NAMES: Record<string, string> = {
    EmailAddress: "Contact Info → Email Address",
    Name: "Contact Info → Name",
    PhoneNumber: "Contact Info → Phone Number",
    PhysicalAddress: "Contact Info → Physical Address",
    Contacts: "Contacts → Contacts",
    AudioData: "User Content → Audio Data",
    PhotosorVideos: "User Content → Photos or Videos",
    EmailsOrTextMessages: "User Content → Emails or Text Messages",
    CustomerSupport: "User Content → Customer Support",
    OtherUserContent: "User Content → Other User Content",
    ProductInteraction: "Usage Data → Product Interaction",
    UserID: "Identifiers → User ID",
    DeviceID: "Identifiers → Device ID",
    PreciseLocation: "Location → Precise Location",
    CoarseLocation: "Location → Coarse Location",
    CrashData: "Diagnostics → Crash Data",
  };

  const declared = [...manifest.matchAll(
    /<string>NSPrivacyCollectedDataType(\w+)<\/string>\s*<key>NSPrivacyCollectedDataTypeLinked<\/key>\s*<(true|false)\/>\s*<key>NSPrivacyCollectedDataTypeTracking<\/key>\s*<(true|false)\/>/g,
  )].map((m) => ({ type: m[1], linked: m[2] === "true", tracking: m[3] === "true" }));

  const section = pack.slice(pack.indexOf("## 3. App Privacy"), pack.indexOf("## 4."));
  const rows = [...section.matchAll(/^\| ([^|]+→[^|]+) \| ([^|]+) \|/gm)].map((m) => ({
    name: m[1].trim(),
    linked: /yes/i.test(m[2]),
  }));

  it("declares no tracking anywhere", () => {
    expect(manifest).toMatch(/<key>NSPrivacyTracking<\/key>\s*<false\/>/);
    expect(declared.length).toBeGreaterThan(10);
    for (const d of declared) expect(d.tracking, d.type).toBe(false);
  });

  it("lists exactly the manifest's data types, linked the same way", () => {
    for (const d of declared) expect(NAMES[d.type], `no label name for ${d.type}`).toBeDefined();
    const fromManifest = declared.map((d) => `${NAMES[d.type]}=${d.linked}`).sort();
    const fromTable = rows.map((r) => `${r.name}=${r.linked}`).sort();
    expect(fromTable).toEqual(fromManifest);
  });
});
