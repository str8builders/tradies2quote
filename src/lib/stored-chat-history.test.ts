import { describe, expect, it } from "vitest";
import type { QuoteData } from "./quote-types";
import { withStoredChatHistory } from "./stored-chat-history";

const quote: QuoteData = {
  client: { name: "Sam Taylor", address: null, email: null, phone: null },
  job_summary: "Deck",
  line_items: [],
  materials_subtotal: 0,
  labour_subtotal: 0,
  markup_pct: 0,
  markup_amount: 0,
  subtotal_before_tax: 0,
  tax_amount: 0,
  total: 0,
  currency: "NZD",
  tax_label: "GST",
  tax_rate: 15,
  terms: "",
  notes: [],
};

const OLD = [{ role: "customer", content: "Pine instead?", timestamp: "2026-09-28T10:00:00.000Z" }];
const NEWER = [
  ...OLD,
  { role: "customer", content: "Can you start Monday?", timestamp: "2026-09-28T10:05:00.000Z" },
  {
    role: "assistant",
    content: "I've passed that on.",
    timestamp: "2026-09-28T10:05:02.000Z",
    note_to_tradie: "Wants a Monday start",
  },
];

describe("a save never writes its own copy of the customer chat", () => {
  it("keeps the stored chat, not the copy the page loaded earlier", () => {
    const next = withStoredChatHistory({ ...quote, total: 99, chat_history: OLD }, { ...quote, chat_history: NEWER });
    expect(next.chat_history).toEqual(NEWER);
    expect(next.total).toBe(99);
  });

  it("drops a chat the stored row doesn't have", () => {
    const next = withStoredChatHistory({ ...quote, chat_history: OLD }, quote);
    expect("chat_history" in next).toBe(false);
    expect("chat_history" in withStoredChatHistory({ ...quote, chat_history: OLD }, { chat_history: null })).toBe(false);
    expect("chat_history" in withStoredChatHistory({ ...quote, chat_history: OLD }, null)).toBe(false);
  });

  it("adds the stored chat when the incoming copy has none", () => {
    expect(withStoredChatHistory(quote, { chat_history: NEWER }).chat_history).toEqual(NEWER);
  });

  it("changes nothing else and leaves the incoming quote alone", () => {
    const incoming = { ...quote, chat_history: OLD };
    const next = withStoredChatHistory(incoming, { ...quote, chat_history: NEWER, total: 5 });
    expect(incoming.chat_history).toBe(OLD);
    const { chat_history: _chat, ...rest } = next;
    expect(rest).toEqual(quote);
  });
});
