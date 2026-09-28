// The classic Send buttons save first. A save that throws used to leave the
// button on "Saving…" for good (and the unhandled rejection went to the error
// sink); now the button resets with plain words, and a page left open across
// an update hands the error back so it can load the new version.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SAVE_FAILED, SAVE_THREW, saveBeforeSending } from "./save-before-send";

const STALE = new Error('Server Action "40bcecfe" was not found on the server.');

describe("saving before a classic send", () => {
  it("goes ahead when the save worked", async () => {
    expect(await saveBeforeSending(async () => true)).toEqual({ ok: true });
  });

  it("says so when the save was refused", async () => {
    expect(await saveBeforeSending(async () => false)).toEqual({ ok: false, message: SAVE_FAILED, staleDeploy: null });
  });

  it("resets with plain words when the save throws", async () => {
    const out = await saveBeforeSending(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(out).toEqual({ ok: false, message: SAVE_THREW, staleDeploy: null });
  });

  it("hands back an update's stale-action error so the page reloads", async () => {
    const out = await saveBeforeSending(async () => {
      throw STALE;
    });
    expect(out).toEqual({ ok: false, message: SAVE_THREW, staleDeploy: STALE });
  });
});

describe("the classic buttons use it, and mark-paid can't spin forever", () => {
  const source = (file: string) => readFileSync(join(__dirname, file), "utf8");

  it.each(["StickyActionBar.tsx", "SendQuoteButton.tsx"])("%s saves through saveBeforeSending", (file) => {
    const code = source(file);
    expect(code).toContain("await saveBeforeSending(onSaveBeforeSend)");
    expect(code).not.toContain("await onSaveBeforeSend()");
    expect(code).toContain("reloadForUpdate(setErrorMessage, saved.staleDeploy)");
  });

  it("InvoiceDraftCard catches a thrown mark-paid and create", () => {
    const code = source("InvoiceDraftCard.tsx");
    expect(code).toMatch(/try \{\s*res = await markInvoicePaid\(invoice\.id\);\s*\} catch \(e\) \{\s*\/\/[^\n]*\n\s*setPaidState\("error"\);/);
    expect(code).toMatch(/try \{\s*const res = await createInvoiceFromQuote\(quoteId\);/);
    expect(code.match(/isStaleDeployError\(e\)/g)).toHaveLength(2);
  });
});
