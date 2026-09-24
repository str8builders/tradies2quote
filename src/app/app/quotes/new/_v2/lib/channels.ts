/**
 * The ways into a new quote (new look): which are offered, how they are
 * described, and when "Write my quote" can go. Same rules as the current
 * tabs: a way in is offered only when its provider is configured (voice
 * needs transcription, a plan photo needs the drawing reader; typing always
 * works), in the same order, and a typed job needs the shared minimum length.
 */

import { MIN_TYPED_LENGTH } from "../../_lib/quote-input";

export type Channel = "talk" | "type" | "scan";

export interface ChannelFlags {
  voiceEnabled: boolean;
  scanEnabled: boolean;
}

export interface ChannelChoice {
  channel: Channel;
  title: string;
  /** One plain line under the title. */
  line: string;
  /** The first choice is the quickest way in and gets the orange chip. */
  primary: boolean;
}

const COPY: Record<Channel, { title: string; line: string }> = {
  talk: { title: "Talk", line: "Say the job like you'd tell a mate." },
  type: { title: "Type", line: "A few lines is enough." },
  scan: { title: "Photo of a plan", line: "Snap the drawing and we'll count the materials." },
};

/** Offered ways in, in order: talk, type, photo of a plan. */
export function availableChannels({ voiceEnabled, scanEnabled }: ChannelFlags): Channel[] {
  const channels: Channel[] = [];
  if (voiceEnabled) channels.push("talk");
  channels.push("type");
  if (scanEnabled) channels.push("scan");
  return channels;
}

export function channelChoices(flags: ChannelFlags): ChannelChoice[] {
  return availableChannels(flags).map((channel, index) => ({
    channel,
    ...COPY[channel],
    primary: index === 0,
  }));
}

export function channelTitle(channel: Channel): string {
  return COPY[channel].title;
}

/** With only one way in there is nothing to choose, so open it straight away. */
export function firstScreen(channels: readonly Channel[]): "choose" | Channel {
  return channels.length === 1 ? channels[0] : "choose";
}

/**
 * Characters needed before a quote can be written. Voice and plan-photo
 * text arrives complete, so any is enough; typing needs a few words so a
 * single word never starts a quote.
 */
export function minLengthFor(channel: Channel): number {
  return channel === "type" ? MIN_TYPED_LENGTH : 1;
}

export function readyToWrite(channel: Channel, text: string): boolean {
  return text.trim().length >= minLengthFor(channel);
}

/** The line under the typing box: the minimum explained kindly, never as a count. */
export function typedHint(text: string): string {
  const length = text.trim().length;
  if (length === 0) return "A sentence is enough to get started.";
  if (length < MIN_TYPED_LENGTH) return "Keep going. A few more words and I can write it up.";
  return "That's enough to write a quote. Add more detail if you like.";
}

/** Shown above the disabled button while the job isn't ready yet. */
export function notReadyHint(channel: Channel): string {
  if (channel === "type") return "Add a few more words first.";
  if (channel === "scan") return "Take or upload a photo of the plan first.";
  return "Say the job first.";
}
