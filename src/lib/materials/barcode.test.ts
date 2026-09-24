import { describe, expect, it } from "vitest";
import {
  BARCODE_UNITS,
  expandUpcE,
  gs1CheckDigit,
  isBarcodeUnit,
  isStorableBarcode,
  normalizeBarcode,
  pickScannedCode,
} from "./barcode";

const ok = (code: string) => ({ ok: true, code });
const CHECK = /don't add up/;

describe("gs1CheckDigit — the modulo-10 digit printed last on EAN/UPC codes", () => {
  it.each([
    ["400638133393", 1], // EAN-13 4006381333931 (Stabilo, the Wikipedia EAN-13 example)
    ["590123412345", 7], // EAN-13 5901234123457 (GS1 sample)
    ["978020137962", 4], // EAN-13 / ISBN 9780201379624
    ["9638507", 4], // EAN-8 96385074
    ["03600029145", 2], // UPC-A 036000291452
  ])("%s → %i", (body, digit) => {
    expect(gs1CheckDigit(body)).toBe(digit);
  });
});

describe("expandUpcE — the zero-suppressed UPC-E back to its UPC-A", () => {
  it.each([
    ["01234565", "012345000065"], // last digit 5–9
    ["04252614", "042100005264"], // last digit 0–2 (Coca-Cola can)
    ["01234531", "012300000451"], // last digit 3
    ["01234543", "012340000053"], // last digit 4
  ])("%s → %s", (upce, upca) => {
    expect(expandUpcE(upce)).toBe(upca);
  });

  it("rejects anything that is not 8 digits with number system 0 or 1", () => {
    expect(expandUpcE("21234565")).toBeNull();
    expect(expandUpcE("0123456")).toBeNull();
    expect(expandUpcE("0123456X")).toBeNull();
  });
});

describe("normalizeBarcode — scanned retail codes (EAN / UPC)", () => {
  it.each([
    ["4006381333931", "ean_13", "4006381333931"],
    ["5901234123457", "ean_13", "5901234123457"],
    ["9780201379624", "isbn", "9780201379624"],
    ["96385074", "ean_8", "96385074"],
    ["73513537", "ean_8", "73513537"],
    // UPC-E is stored as the EAN-13 of the UPC-A it expands to: the WebAssembly
    // reader reports it that way, and the phone's own detector as 8 digits.
    ["01234565", "upc_e", "0012345000065"],
    ["0012345000065", "upc_e", "0012345000065"],
    ["04252614", "upc_e", "0042100005264"],
    // UPC-A is stored as EAN-13 with a leading zero, so the same product
    // matches however the scanner reports it.
    ["036000291452", "upc_a", "0036000291452"],
    ["0036000291452", "upc_a", "0036000291452"],
    ["036000291452", "ean_13", "0036000291452"],
    ["0036000291452", "ean_13", "0036000291452"],
  ])("%s (%s) → %s", (raw, format, code) => {
    expect(normalizeBarcode(raw, format)).toEqual(ok(code));
  });

  it.each([
    ["4006381333932", "ean_13"],
    ["5901234123458", "ean_13"],
    ["96385075", "ean_8"],
    ["01234566", "upc_e"],
    ["036000291453", "upc_a"],
  ])("rejects %s (%s): the check digit does not match", (raw, format) => {
    const result = normalizeBarcode(raw, format);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(CHECK);
  });

  it("rejects a retail code of the wrong length as a misread", () => {
    const result = normalizeBarcode("40063813339", "ean_13");
    expect(result).toEqual({ ok: false, reason: expect.stringMatching(/didn't read properly/) });
  });

  it("gives the same code for UPC-A whether read as UPC-A, as EAN-13 or typed", () => {
    expect(normalizeBarcode("036000291452", "upc_a")).toEqual(normalizeBarcode("036000291452"));
    expect(normalizeBarcode("0036000291452", "ean_13")).toEqual(normalizeBarcode("036000291452"));
  });

  it("gives the same code for UPC-E however it was read", () => {
    const typed = normalizeBarcode("01234565");
    expect(normalizeBarcode("01234565", "upc_e")).toEqual(typed); // native detector
    expect(normalizeBarcode("0012345000065", "upc_e")).toEqual(typed); // zxing
    expect(normalizeBarcode("012345000065", "upc_a")).toEqual(typed);
  });
});

describe("normalizeBarcode — numbers typed by hand", () => {
  it.each([
    ["4006381333931", "4006381333931"],
    ["  4006381333931 \n", "4006381333931"],
    ["4 006381 333931", "4006381333931"],
    ["400-6381-333931", "4006381333931"],
    ["036000291452", "0036000291452"],
    ["96385074", "96385074"], // EAN-8
    ["01234565", "0012345000065"], // UPC-E (number system 0/1), same as when scanned
    ["04252614", "0042100005264"], // UPC-E whose digits are not a valid EAN-8
    ["15400141288763", "15400141288763"], // 14-digit carton code kept as typed
    ["1234", "1234"],
  ])("%j → %s", (raw, code) => {
    expect(normalizeBarcode(raw)).toEqual(ok(code));
  });

  it.each(["4006381333932", "036000291453", "96385075"])(
    "catches a typo in %s with a plain reason",
    (raw) => {
      const result = normalizeBarcode(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(CHECK);
    },
  );
});

describe("normalizeBarcode — other symbologies keep the text as printed", () => {
  it.each([
    ["T2Q-00042", "code_128", "T2Q-00042"],
    ["123456789012", "code_128", "123456789012"], // 12 digits, but not a UPC
    ["CODE 39", "code_39", "CODE 39"],
    ["00012345678905", "itf", "00012345678905"],
    ["https://t2q.nz/p/9", "qr_code", "https://t2q.nz/p/9"],
    ["  ABC-1234  ", "code_128", "ABC-1234"],
  ])("%j (%s) → %j", (raw, format, code) => {
    expect(normalizeBarcode(raw, format)).toEqual(ok(code));
  });

  it("is idempotent: a normalised code normalises to itself with the same format", () => {
    for (const [raw, format] of [
      ["036000291452", "upc_a"],
      ["01234565", "upc_e"],
      ["123456789012", "code_128"],
      ["4 006381 333931", null],
    ] as const) {
      const first = normalizeBarcode(raw, format);
      expect(first.ok).toBe(true);
      if (first.ok) expect(normalizeBarcode(first.code, format)).toEqual(first);
    }
  });
});

describe("normalizeBarcode — the storage rule (4–64 printable ASCII)", () => {
  it.each([
    ["", /Scan a barcode or type/],
    ["   ", /Scan a barcode or type/],
    ["123", /too short/],
    ["A".repeat(65), /too long/],
    ["Ünïcode-9", /characters we can't save/],
    ["\u001d0109415", /characters we can't save/],
    ["AB\tCD", /characters we can't save/],
  ])("rejects %j", (raw, reason) => {
    const result = normalizeBarcode(raw, "code_128");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(reason);
  });

  it("rejects values that are not strings", () => {
    expect(normalizeBarcode(undefined).ok).toBe(false);
    expect(normalizeBarcode(4006381333931 as unknown as string).ok).toBe(false);
  });

  it("accepts exactly 64 characters", () => {
    expect(normalizeBarcode("A".repeat(64), "code_128")).toEqual(ok("A".repeat(64)));
  });
});

describe("isStorableBarcode — mirrors the materials_barcode_format check constraint", () => {
  it.each([
    ["1234", true],
    ["A".repeat(64), true],
    ["AB CD", true],
    ["~!@#", true],
    ["123", false],
    ["A".repeat(65), false],
    [" ABCD", false],
    ["ABCD ", false],
    ["ABéCD", false],
    ["AB\u007fCD", false],
  ])("%j → %s", (code, storable) => {
    expect(isStorableBarcode(code)).toBe(storable);
  });
});

describe("units offered for a scanned product", () => {
  it("lists the everyday units, each first", () => {
    expect(BARCODE_UNITS).toEqual(["each", "m", "m²", "box", "bag", "sheet", "L", "kg", "roll", "pack"]);
  });

  it("only accepts a unit from that list", () => {
    expect(isBarcodeUnit("m²")).toBe(true);
    expect(isBarcodeUnit("kg")).toBe(true);
    expect(isBarcodeUnit("tonne")).toBe(false);
    expect(isBarcodeUnit("")).toBe(false);
    expect(isBarcodeUnit(undefined)).toBe(false);
  });
});

describe("pickScannedCode — which read from the camera to act on", () => {
  it("accepts a checked retail code on the first read", () => {
    expect(pickScannedCode([{ rawValue: "4006381333931", format: "ean_13" }], null)).toEqual({
      kind: "accept",
      code: "4006381333931",
      format: "ean_13",
    });
  });

  it("skips a misread and takes the next good code in the same frame", () => {
    expect(
      pickScannedCode(
        [
          { rawValue: "4006381333932", format: "ean_13" },
          { rawValue: "96385074", format: "ean_8" },
        ],
        null,
      ),
    ).toEqual({ kind: "accept", code: "96385074", format: "ean_8" });
  });

  it("waits for a second matching read of a code with no check digit", () => {
    const first = pickScannedCode([{ rawValue: "PART-77", format: "code_39" }], null);
    expect(first).toEqual({ kind: "confirm", key: "code_39:PART-77" });
    expect(pickScannedCode([{ rawValue: "PART-77", format: "code_39" }], "code_39:PART-77")).toEqual({
      kind: "accept",
      code: "PART-77",
      format: "code_39",
    });
    // A different second read starts over rather than accepting either.
    expect(pickScannedCode([{ rawValue: "PART-78", format: "code_39" }], "code_39:PART-77")).toEqual({
      kind: "confirm",
      key: "code_39:PART-78",
    });
  });

  it("accepts a single read from a still photo when asked to", () => {
    expect(
      pickScannedCode([{ rawValue: "PART-77", format: "code_39" }], null, { singleRead: true }),
    ).toEqual({ kind: "accept", code: "PART-77", format: "code_39" });
  });

  it("reports why the only code seen can't be used", () => {
    expect(pickScannedCode([{ rawValue: "12", format: "code_128" }], null)).toEqual({
      kind: "reject",
      reason: expect.stringMatching(/too short/),
    });
  });

  it("returns none for an empty frame", () => {
    expect(pickScannedCode([], null)).toEqual({ kind: "none" });
  });
});
