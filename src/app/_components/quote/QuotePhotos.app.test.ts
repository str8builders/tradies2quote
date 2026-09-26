// The line under "Job photos" (the job page's More tools): plan names never
// show inside the iPhone app (App Store 3.1.3(f)); the website is unchanged.

import { describe, expect, it } from "vitest";
import { photosNote } from "./QuotePhotos";

const PLAN_NAMES = /crew|builder|solo|plan|subscri|upgrade/i;

describe("photosNote", () => {
  it("in the iPhone app: plain words when photo attachments aren't on", () => {
    expect(photosNote({ enabled: false, fromClient: false, inApp: true })).toBe(
      "Adding photos to quotes isn’t switched on for this account.",
    );
    expect(photosNote({ enabled: false, fromClient: true, inApp: true })).toBe("Photos the client sent with their request.");
    for (const fromClient of [false, true]) {
      expect(photosNote({ enabled: false, fromClient, inApp: true })).not.toMatch(PLAN_NAMES);
    }
  });

  it("on the website: as before", () => {
    expect(photosNote({ enabled: false, fromClient: false, inApp: false })).toBe("Photo attachments are included with Crew and Builder.");
    expect(photosNote({ enabled: false, fromClient: true, inApp: false })).toBe(
      "Photos the client sent with their request. Adding your own photos is included with Crew and Builder.",
    );
  });

  it("when photos are on, the same words everywhere", () => {
    const on = "Attach up to 8 photos before sending. Clients can view them on the quote link. Photos are locked once sent.";
    expect(photosNote({ enabled: true, fromClient: false, inApp: true })).toBe(on);
    expect(photosNote({ enabled: true, fromClient: false, inApp: false })).toBe(on);
  });
});
