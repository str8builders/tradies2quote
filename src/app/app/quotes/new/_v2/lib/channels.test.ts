import { describe, expect, it } from "vitest";
import { MIN_TYPED_LENGTH } from "../../_lib/quote-input";
import {
  availableChannels,
  channelChoices,
  channelTitle,
  firstScreen,
  minLengthFor,
  notReadyHint,
  readyToWrite,
  typedHint,
} from "./channels";

describe("which ways in are offered", () => {
  it("offers a way in only when its provider is configured, in the current tabs' order", () => {
    expect(availableChannels({ voiceEnabled: true, scanEnabled: true })).toEqual(["talk", "type", "scan"]);
    expect(availableChannels({ voiceEnabled: false, scanEnabled: true })).toEqual(["type", "scan"]);
    expect(availableChannels({ voiceEnabled: true, scanEnabled: false })).toEqual(["talk", "type"]);
    expect(availableChannels({ voiceEnabled: false, scanEnabled: false })).toEqual(["type"]);
  });

  it("describes each choice in one plain line, the first one as the main choice", () => {
    expect(channelChoices({ voiceEnabled: true, scanEnabled: true })).toEqual([
      { channel: "talk", title: "Talk", line: "Say the job like you'd tell a mate.", primary: true },
      { channel: "type", title: "Type", line: "A few lines is enough.", primary: false },
      {
        channel: "scan",
        title: "Photo of a plan",
        line: "Snap the drawing and we'll count the materials.",
        primary: false,
      },
    ]);
    const noVoice = channelChoices({ voiceEnabled: false, scanEnabled: true });
    expect(noVoice.map((c) => [c.channel, c.primary])).toEqual([
      ["type", true],
      ["scan", false],
    ]);
    expect(channelTitle("scan")).toBe("Photo of a plan");
  });

  it("skips the choice when there is only one way in", () => {
    expect(firstScreen(["type"])).toBe("type");
    expect(firstScreen(["talk", "type"])).toBe("choose");
    expect(firstScreen(["talk", "type", "scan"])).toBe("choose");
  });
});

describe("when Write my quote can go", () => {
  it("typing needs the shared minimum; voice and plan words need anything at all", () => {
    expect(minLengthFor("type")).toBe(MIN_TYPED_LENGTH);
    expect(minLengthFor("talk")).toBe(1);
    expect(minLengthFor("scan")).toBe(1);
    expect(readyToWrite("type", "Deck 6 by 4")).toBe(false);
    expect(readyToWrite("type", `  ${"x".repeat(MIN_TYPED_LENGTH - 1)}   `)).toBe(false);
    expect(readyToWrite("type", "x".repeat(MIN_TYPED_LENGTH))).toBe(true);
    expect(readyToWrite("talk", "Deck")).toBe(true);
    expect(readyToWrite("talk", "   ")).toBe(false);
    expect(readyToWrite("scan", "Framing 12 m")).toBe(true);
    expect(readyToWrite("scan", "")).toBe(false);
  });

  it("explains the typing minimum kindly, without counting characters", () => {
    expect(typedHint("")).toBe("A sentence is enough to get started.");
    expect(typedHint("Deck")).toBe("Keep going. A few more words and I can write it up.");
    expect(typedHint("Deck 6 m by 4 m off the back door")).toBe(
      "That's enough to write a quote. Add more detail if you like.",
    );
    for (const text of ["", "Deck", "Deck 6 m by 4 m off the back door"]) {
      expect(typedHint(text)).not.toMatch(/\d|characters?/);
    }
    expect(notReadyHint("type")).toBe("Add a few more words first.");
    expect(notReadyHint("scan")).toBe("Take or upload a photo of the plan first.");
    expect(notReadyHint("talk")).toBe("Say the job first.");
  });
});
