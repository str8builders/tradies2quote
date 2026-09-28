// What the client asked on the quote link, as the tradie sees it, rendered to
// static HTML in node (the moderation controls included). The classic look is
// pinned by file snapshots taken from the untouched components, before the new
// look existed, so look="classic" (the default) provably renders exactly as
// before. Regenerate only after an intended change to the classic look:
// npx vitest run <this file> --update
//
// look="new" (the new-look job page's "More tools" sheet) draws the same
// thread and controls with the kit: same test ids, the new look's rules.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ComponentProps, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

import type { QuoteData } from "@/lib/quote-types";
import { markupRuleBreaks, sourceRuleBreaks } from "@/test/design-rules";
import { chatTime } from "../_v2/dates";
import { ChatModerationControls } from "./ChatModerationControls";
import { ChatModerationControlsV2 } from "./ChatModerationControlsV2";
import { CustomerChatPanel } from "./CustomerChatPanel";

const QUOTE: QuoteData = {
  client: { name: "Sam Taylor", address: "14 Rata St", email: "sam@example.invalid", phone: "021 555 0101" },
  job_summary: "New kwila deck at 14 Rata St",
  line_items: [],
  materials_subtotal: 0,
  labour_subtotal: 0,
  markup_pct: 0,
  markup_amount: 0,
  subtotal_before_tax: 0,
  tax_amount: 0,
  total: 3670.8,
  currency: "NZD",
  tax_label: "GST",
  tax_rate: 15,
  terms: "",
  notes: [],
};

const AT = ["2026-09-21T02:15:00.000Z", "2026-09-21T02:16:00.000Z", "2026-09-22T19:40:00.000Z"];
const THREAD = [
  { role: "customer", content: "Could you do it in pine to save a bit?", timestamp: AT[0], intent: "price" },
  {
    role: "assistant",
    content: "Pine is cheaper up front.\nI've passed it on to the builder to price.",
    timestamp: AT[1],
    note_to_tradie: "Asked for a cheaper pine option",
  },
  { role: "system", content: "not a chat message", timestamp: AT[1] },
  { role: "customer", content: "Thanks! Also, can you start in October?", timestamp: AT[2], note_to_tradie: "Wants an October start" },
];
const withChat = (history: unknown[]): QuoteData => ({ ...QUOTE, chat_history: history });

/** The times as the panel prints them: NZ time, whatever the machine's time zone. */
const stamp = (iso: string) => chatTime(iso);
const render = (el: ReactElement) =>
  AT.reduce((out, iso, i) => out.replaceAll(stamp(iso), `<TIME${i}>`), renderToStaticMarkup(el));

const STATES = {
  empty: { quoteData: QUOTE, chatDisabled: false },
  thread: { quoteData: withChat(THREAD), chatDisabled: false },
  "chat-off": { quoteData: withChat(THREAD.slice(0, 2)), chatDisabled: true },
};

describe("classic look (the default) renders exactly as before", () => {
  it.each(Object.keys(STATES) as Array<keyof typeof STATES>)("%s", async (name) => {
    const out = render(<CustomerChatPanel quoteId="q-1" {...STATES[name]} />);
    await expect(out).toMatchFileSnapshot(`./__snapshots__/CustomerChatPanel.classic.${name}.html`);
  });

  it("prints each message's time in NZ time, not the server's zone", () => {
    // 02:15 UTC on Mon 21 Sept is 2:15 pm in NZ; 19:40 UTC on Tue 22 Sept is
    // 7:40 am on Wed 23 Sept there. The server runs in UTC.
    for (const look of ["classic", "new"] as const) {
      const out = renderToStaticMarkup(<CustomerChatPanel quoteId="q-1" {...STATES.thread} look={look} />);
      expect(out).toContain("Mon 2:15 pm");
      expect(out).toContain("Wed 7:40 am");
    }
  });

  it("chat is on unless the quote says otherwise", () => {
    expect(render(<CustomerChatPanel quoteId="q-1" quoteData={QUOTE} />)).toBe(
      render(<CustomerChatPanel quoteId="q-1" quoteData={QUOTE} chatDisabled={false} />),
    );
  });
});

const NAMES = Object.keys(STATES) as Array<keyof typeof STATES>;
const panel = (name: keyof typeof STATES, look?: "classic" | "new") =>
  render(<CustomerChatPanel quoteId="q-1" {...STATES[name]} look={look} />);
const testIds = (markup: string) => [...markup.matchAll(/\bdata-testid="[^"]*"/g)].map((m) => m[0]);
const words = (markup: string) => markup.replace(/<[^>]*>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
/** The opening tag of the first element carrying a fragment. */
const tag = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, `"${fragment}" in markup`).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};

describe("new look: CustomerChatPanel", () => {
  it('look="classic" is the default', () => {
    for (const name of NAMES) expect(panel(name, "classic")).toBe(panel(name));
    const controls = (look?: "classic" | "new") =>
      renderToStaticMarkup(<ChatModerationControls quoteId="q-1" chatDisabled look={look} />);
    expect(controls("classic")).toBe(controls());
  });

  it.each(NAMES)("%s: the classic test ids, in order", (name) => {
    expect(testIds(panel(name, "new"))).toEqual(testIds(panel(name)));
  });

  it("no messages yet: the controls, and what the client can do", () => {
    const out = panel("empty", "new");
    expect(words(out)).toContain("No messages yet");
    expect(words(out)).toContain("never agrees to a price change without you");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("a thread: the count, the notes flagged for the tradie first, then every message oldest first", () => {
    const out = panel("thread", "new");
    expect(words(out)).toContain("2 messages from your client");
    expect(words(out)).toContain("2 notes for you");
    expect(tag(out, 'data-tone="warn"')).toContain("bg-ui-warn-soft");
    expect(words(out)).toContain("The chat flagged these for you");
    expect(out.indexOf("Asked for a cheaper pine option")).toBeLessThan(out.indexOf('data-testid="customer-chat-thread"'));
    // Not a chat message: left out, as before.
    expect(out).not.toContain("not a chat message");
    const thread = out.slice(out.indexOf('data-testid="customer-chat-thread"'));
    expect(thread.indexOf("Could you do it in pine")).toBeLessThan(thread.indexOf("Pine is cheaper"));
    expect(thread.indexOf("Pine is cheaper")).toBeLessThan(thread.indexOf("start in October"));
    // The client's messages sit on the right in the brand tint, the assistant's on the left.
    expect(thread).toMatch(/<li class="flex justify-end"><div class="[^"]*bg-ui-brand-soft[^"]*"><p[^>]*><span class="font-semibold">Your client<\/span>, <TIME0>/);
    expect(thread).toMatch(/<li class="flex justify-start"><div class="[^"]*bg-ui-surface-2[^"]*"><p[^>]*><span class="font-semibold">T2Q assistant<\/span>, <TIME1>/);
    expect(thread).toContain("whitespace-pre-wrap");
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("one note, chat off: singular words, and chat off said plainly", () => {
    const out = panel("chat-off", "new");
    expect(words(out)).toContain("1 message from your client");
    expect(words(out)).toContain("1 note for you");
    expect(words(out)).toContain("Turn chat on");
    expect(words(out)).toContain("Chat is off, so your client can't send messages on this quote.");
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("new look: ChatModerationControls", () => {
  const view = (props: Partial<ComponentProps<typeof ChatModerationControlsV2>> = {}) =>
    renderToStaticMarkup(
      <ChatModerationControlsV2
        chatDisabled={false}
        pending={false}
        reported={false}
        error={null}
        onToggle={() => {}}
        onReport={() => {}}
        {...props}
      />,
    );

  it("two small secondary buttons (48 px to tap) with the classic test ids", () => {
    const out = view();
    for (const id of ["chat-toggle-disabled", "chat-report-tradie"]) {
      const button = tag(out, `data-testid="${id}"`);
      expect(button).toContain('data-variant="secondary"');
      expect(button).toContain("after:-inset-1");
      expect(button).not.toContain('disabled=""');
    }
    expect(words(out)).toContain("Turn chat off");
    expect(words(out)).toContain("Report chat");
    expect(out).not.toContain('role="alert"');
    expect(markupRuleBreaks(out)).toEqual([]);
  });

  it("while a change is saving both wait; once reported, reporting is done", () => {
    const busy = view({ pending: true });
    expect(tag(busy, 'data-testid="chat-toggle-disabled"')).toContain('disabled=""');
    expect(tag(busy, 'data-testid="chat-report-tradie"')).toContain('disabled=""');
    const reported = view({ reported: true });
    expect(tag(reported, 'data-testid="chat-toggle-disabled"')).not.toContain('disabled=""');
    expect(tag(reported, 'data-testid="chat-report-tradie"')).toContain('disabled=""');
    expect(words(reported)).toContain("Reported");
    expect(words(reported)).not.toContain("Report chat");
    expect(markupRuleBreaks(busy)).toEqual([]);
    expect(markupRuleBreaks(reported)).toEqual([]);
  });

  it("a failed change is read out", () => {
    const out = view({ error: "Couldn't update the chat — try again." });
    expect(tag(out, 'role="alert"')).toContain("text-ui-bad");
    expect(words(out)).toContain("Couldn't update the chat — try again.");
    expect(markupRuleBreaks(out)).toEqual([]);
  });
});

describe("new-look source files follow the design rules", () => {
  it.each(["CustomerChatPanelV2.tsx", "ChatModerationControlsV2.tsx"])("%s", (file) => {
    expect(sourceRuleBreaks(readFileSync(join(__dirname, file), "utf8"))).toEqual([]);
  });
});
