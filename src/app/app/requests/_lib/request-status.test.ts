import { describe, expect, it } from "vitest";
import {
  STALE_MS,
  canGenerateDraft,
  isStaleRequest,
  requestContactLine,
  requestStatus,
  toRequestItem,
  type RequestRow,
} from "./request-status";

const NOW = Date.parse("2026-09-27T01:00:00Z");
const fresh = new Date(NOW - 60_000).toISOString();
const stale = new Date(NOW - STALE_MS - 1).toISOString();

const row = (over: Partial<RequestRow> = {}): RequestRow => ({
  id: "r1",
  quote_id: "q1",
  client_name: "Aroha Smith",
  client_email: "aroha@example.nz",
  client_phone: "021 555 0101",
  site_address: "12 Rata St",
  description: "New deck, about 20 m²",
  status: "new",
  error_message: null,
  created_at: fresh,
  seen_at: null,
  ...over,
});

describe("client request status", () => {
  it("a request goes stale after five minutes", () => {
    expect(isStaleRequest(fresh, NOW)).toBe(false);
    expect(isStaleRequest(stale, NOW)).toBe(true);
  });

  it("the draft quote decides once it has lines", () => {
    expect(requestStatus(row({ status: "generation_failed" }), { hasLines: true, status: "draft" }, NOW)).toEqual({
      label: "Draft ready to review",
      tone: "ok",
    });
    expect(requestStatus(row(), { hasLines: true, status: "sent" }, NOW)).toEqual({ label: "Quote sent", tone: "neutral" });
  });

  it("otherwise the request row, with a stalled draft needing the tradie", () => {
    expect(requestStatus(row(), undefined, NOW)).toEqual({ label: "Draft being prepared", tone: "info" });
    expect(requestStatus(row({ created_at: stale }), undefined, NOW)).toEqual({ label: "Needs you to generate", tone: "warn" });
    expect(requestStatus(row({ status: "generation_failed" }), undefined, NOW).label).toBe("Needs you to generate");
    expect(requestStatus(row({ status: "generated" }), undefined, NOW).label).toBe("Draft ready to review");
    expect(requestStatus(row({ status: "dismissed" }), undefined, NOW)).toEqual({ label: "Dismissed", tone: "neutral" });
    expect(requestStatus(row({ status: "odd" }), undefined, NOW)).toEqual({ label: "odd", tone: "neutral" });
  });

  it("offers Generate only for a draft without lines whose run failed or stalled", () => {
    expect(canGenerateDraft(row({ status: "generation_failed" }), undefined, NOW)).toBe(true);
    expect(canGenerateDraft(row({ created_at: stale }), { hasLines: false, status: "draft" }, NOW)).toBe(true);
    expect(canGenerateDraft(row(), undefined, NOW)).toBe(false);
    expect(canGenerateDraft(row({ status: "generation_failed" }), { hasLines: true, status: "draft" }, NOW)).toBe(false);
    expect(canGenerateDraft(row({ status: "generation_failed", quote_id: null }), undefined, NOW)).toBe(false);
  });

  it("contact details in one line, or a plain note", () => {
    expect(requestContactLine(row())).toBe("021 555 0101 · aroha@example.nz · 12 Rata St");
    expect(requestContactLine(row({ client_phone: null, client_email: null, site_address: null }))).toBe("No contact details");
  });

  it("builds the new look's item, with the note in the page's words", () => {
    const item = toRequestItem(
      row({ error_message: "Subscription inactive", status: "generation_failed" }),
      undefined,
      (note) => `app: ${note}`,
      NOW,
    );
    expect(item).toMatchObject({
      id: "r1",
      quoteId: "q1",
      clientName: "Aroha Smith",
      note: "app: Subscription inactive",
      status: { label: "Needs you to generate", tone: "warn" },
      canGenerate: true,
      dismissed: false,
      unseen: true,
    });
    expect(item.received).toMatch(/2026/);
    expect(toRequestItem(row({ seen_at: fresh, status: "dismissed" }), undefined, (n) => n, NOW)).toMatchObject({
      unseen: false,
      dismissed: true,
      note: null,
    });
  });
});
