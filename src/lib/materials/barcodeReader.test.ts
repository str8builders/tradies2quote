import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The zxing ponyfill is replaced with a spy so no test ever fetches a .wasm.
const zxing = vi.hoisted(() => ({
  prepare: vi.fn(),
  purge: vi.fn(),
  constructed: [] as Array<{ formats?: string[] }>,
  detect: vi.fn(),
}));

vi.mock("barcode-detector/ponyfill", () => ({
  ZXING_WASM_VERSION: "9.9.9",
  prepareZXingModule: zxing.prepare,
  purgeZXingModule: zxing.purge,
  BarcodeDetector: class {
    constructor(options?: { formats?: string[] }) {
      zxing.constructed.push(options ?? {});
    }
    detect = zxing.detect;
  },
}));

type ReaderModule = typeof import("./barcodeReader");

async function freshReader(): Promise<ReaderModule> {
  vi.resetModules();
  return import("./barcodeReader");
}

const g = globalThis as { BarcodeDetector?: unknown };

beforeEach(() => {
  zxing.prepare.mockReset().mockResolvedValue({});
  zxing.purge.mockReset();
  zxing.detect.mockReset().mockResolvedValue([{ rawValue: "4006381333931", format: "ean_13", cornerPoints: [] }]);
  zxing.constructed = [];
  delete g.BarcodeDetector;
});

afterEach(() => {
  delete g.BarcodeDetector;
});

describe("chooseReaderKind", () => {
  it("uses the phone's own detector only when it reads every retail format", async () => {
    const { chooseReaderKind } = await freshReader();
    expect(chooseReaderKind(["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "qr_code"])).toBe("native");
    // Apple Vision (Chrome on a Mac) lists no upc_a: a UPC-A symbol reads as
    // EAN-13 with a leading 0, which normalises to the same stored code.
    expect(chooseReaderKind(["aztec", "code_128", "code_39", "ean_13", "ean_8", "itf", "qr_code", "upc_e"])).toBe("native");
    expect(chooseReaderKind(["ean_13", "ean_8", "code_128", "qr_code"])).toBe("wasm"); // no UPC-E
    expect(chooseReaderKind(["qr_code", "ean_13"])).toBe("wasm");
    expect(chooseReaderKind([])).toBe("wasm");
    expect(chooseReaderKind(null)).toBe("wasm");
  });
});

describe("zxingWasmUrl", () => {
  it("points at our own origin, versioned so an upgrade never mixes files", async () => {
    const { zxingWasmUrl } = await freshReader();
    expect(zxingWasmUrl("3.1.3")).toBe("/vendor/zxing/3.1.3/zxing_reader.wasm");
  });
});

describe("loadBarcodeReader", () => {
  it("uses the native BarcodeDetector when it supports the formats (Chrome on Android)", async () => {
    const constructed: unknown[] = [];
    g.BarcodeDetector = class {
      static getSupportedFormats = async () => ["aztec", "code_128", "code_39", "ean_13", "ean_8", "itf", "qr_code", "upc_a", "upc_e"];
      constructor(options: unknown) {
        constructed.push(options);
      }
      detect = async () => [{ rawValue: "96385074", format: "ean_8", boundingBox: {} }];
    };
    const { loadBarcodeReader } = await freshReader();
    const reader = await loadBarcodeReader();
    expect(reader.kind).toBe("native");
    expect(constructed).toEqual([
      { formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"] },
    ]);
    expect(await reader.detect({} as ImageData)).toEqual([{ rawValue: "96385074", format: "ean_8" }]);
    expect(zxing.prepare).not.toHaveBeenCalled();
  });

  it("falls back to the zxing reader, loading the .wasm from our own origin (Safari / iOS app)", async () => {
    const { loadBarcodeReader } = await freshReader();
    const reader = await loadBarcodeReader();
    expect(reader.kind).toBe("wasm");
    expect(zxing.prepare).toHaveBeenCalledTimes(1);
    const [options] = zxing.prepare.mock.calls[0];
    expect(options.fireImmediately).toBe(true);
    const cdnPrefix = "https://fastly.jsdelivr.net/npm/zxing-wasm@9.9.9/dist/reader/";
    expect(options.overrides.locateFile("zxing_reader.wasm", cdnPrefix)).toBe("/vendor/zxing/9.9.9/zxing_reader.wasm");
    expect(zxing.constructed).toEqual([
      { formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"] },
    ]);
    expect(await reader.detect({} as ImageData)).toEqual([{ rawValue: "4006381333931", format: "ean_13" }]);
  });

  it("falls back to zxing when the native detector lacks retail formats (desktop Chrome on Windows)", async () => {
    g.BarcodeDetector = class {
      static getSupportedFormats = async () => ["qr_code"];
    };
    const { loadBarcodeReader } = await freshReader();
    expect((await loadBarcodeReader()).kind).toBe("wasm");
  });

  it("falls back to zxing when the native detector throws", async () => {
    g.BarcodeDetector = class {
      static getSupportedFormats = async () => {
        throw new Error("service unavailable");
      };
    };
    const { loadBarcodeReader } = await freshReader();
    expect((await loadBarcodeReader()).kind).toBe("wasm");
  });

  it("loads the reader once and reuses it for every scan", async () => {
    const { loadBarcodeReader } = await freshReader();
    const [a, b] = await Promise.all([loadBarcodeReader(), loadBarcodeReader()]);
    expect(a).toBe(b);
    expect(await loadBarcodeReader()).toBe(a);
    expect(zxing.prepare).toHaveBeenCalledTimes(1);
  });

  it("clears a failed .wasm load so the next open tries again", async () => {
    zxing.prepare.mockRejectedValueOnce(new Error("404 : /vendor/zxing/9.9.9/zxing_reader.wasm"));
    const { loadBarcodeReader, BarcodeReaderUnavailableError } = await freshReader();
    await expect(loadBarcodeReader()).rejects.toBeInstanceOf(BarcodeReaderUnavailableError);
    expect(zxing.purge).toHaveBeenCalledTimes(1);
    expect((await loadBarcodeReader()).kind).toBe("wasm");
    expect(zxing.prepare).toHaveBeenCalledTimes(2);
  });
});

describe("frameCropRect — read only what the tradie can see", () => {
  it("maps an object-fit: cover viewport back to camera pixels", async () => {
    const { frameCropRect } = await freshReader();
    // 1280×720 camera shown in a 400×300 box: scaled by 300/720, the sides
    // are cut off, and the visible part is the middle 960×720.
    expect(frameCropRect({ width: 1280, height: 720 }, { width: 400, height: 300 })).toEqual({
      x: 160,
      y: 0,
      width: 960,
      height: 720,
    });
    // Portrait camera in a landscape box: top and bottom are cut off.
    expect(frameCropRect({ width: 720, height: 1280 }, { width: 400, height: 300 })).toEqual({
      x: 0,
      y: 370,
      width: 720,
      height: 540,
    });
  });

  it("returns null until the camera has a frame", async () => {
    const { frameCropRect } = await freshReader();
    expect(frameCropRect({ width: 0, height: 0 }, { width: 400, height: 300 })).toBeNull();
    expect(frameCropRect({ width: 1280, height: 720 }, { width: 0, height: 300 })).toBeNull();
  });
});

describe("createScanner — the canvas work around a reader", () => {
  function fakeCanvas() {
    const ctx = {
      drawImage: vi.fn(),
      getImageData: vi.fn((x: number, y: number, w: number, h: number) => ({ kind: "pixels", w, h })),
    };
    const canvas = { width: 0, height: 0, getContext: vi.fn(() => ctx) };
    return { canvas, ctx };
  }
  const video = (over: Partial<HTMLVideoElement> = {}) =>
    ({ readyState: 4, videoWidth: 1920, videoHeight: 1080, ...over }) as HTMLVideoElement;

  it("hands the WebAssembly reader the visible part of the frame as pixels, scaled to ≤1280px", async () => {
    const { createScanner } = await freshReader();
    const detect = vi.fn(async () => [{ rawValue: "4006381333931", format: "ean_13" }]);
    const { canvas, ctx } = fakeCanvas();
    const scanner = createScanner({ kind: "wasm", detect }, () => canvas as unknown as HTMLCanvasElement);
    const reads = await scanner.readFrame(video(), { width: 400, height: 300 });
    expect(reads).toEqual([{ rawValue: "4006381333931", format: "ean_13" }]);
    // Visible part of 1920×1080 in a 4:3 box is the middle 1440×1080.
    expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 240, 0, 1440, 1080, 0, 0, 1280, 960);
    expect(detect).toHaveBeenCalledWith({ kind: "pixels", w: 1280, h: 960 });
  });

  it("hands a native detector the canvas itself", async () => {
    const { createScanner } = await freshReader();
    const detect = vi.fn(async () => []);
    const { canvas, ctx } = fakeCanvas();
    const scanner = createScanner({ kind: "native", detect }, () => canvas as unknown as HTMLCanvasElement);
    await scanner.readFrame(video({ videoWidth: 640, videoHeight: 480 } as Partial<HTMLVideoElement>), { width: 400, height: 300 });
    expect(ctx.getImageData).not.toHaveBeenCalled();
    expect(detect).toHaveBeenCalledWith(canvas);
    expect(canvas).toMatchObject({ width: 640, height: 480 });
  });

  it("waits for the camera's first frame", async () => {
    const { createScanner } = await freshReader();
    const detect = vi.fn();
    const scanner = createScanner({ kind: "wasm", detect }, () => fakeCanvas().canvas as unknown as HTMLCanvasElement);
    expect(await scanner.readFrame(video({ readyState: 1 } as Partial<HTMLVideoElement>), { width: 400, height: 300 })).toBeNull();
    expect(await scanner.readFrame(video({ videoWidth: 0, videoHeight: 0 } as Partial<HTMLVideoElement>), { width: 400, height: 300 })).toBeNull();
    expect(detect).not.toHaveBeenCalled();
  });

  it("scales a big phone photo down before reading it, then frees it", async () => {
    const close = vi.fn();
    const g2 = globalThis as { createImageBitmap?: unknown };
    g2.createImageBitmap = vi.fn(async () => ({ width: 4032, height: 3024, close }));
    try {
      const { createScanner } = await freshReader();
      const detect = vi.fn(async () => [{ rawValue: "PART-77", format: "code_39" }]);
      const { canvas, ctx } = fakeCanvas();
      const scanner = createScanner({ kind: "wasm", detect }, () => canvas as unknown as HTMLCanvasElement);
      expect(await scanner.readPhoto(new Blob(["x"]))).toEqual([{ rawValue: "PART-77", format: "code_39" }]);
      expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 4032, 3024, 0, 0, 2000, 1500);
      expect(close).toHaveBeenCalled();
    } finally {
      delete g2.createImageBitmap;
    }
  });
});

describe("self-hosted zxing .wasm", () => {
  const root = resolve(__dirname, "../../..");

  it("the installed .wasm is the exact build the barcode-detector glue expects", async () => {
    const actual = await vi.importActual<typeof import("barcode-detector/ponyfill")>("barcode-detector/ponyfill");
    const fromDetector = createRequire(createRequire(join(root, "package.json")).resolve("barcode-detector/ponyfill"));
    const wasm = readFileSync(fromDetector.resolve("zxing-wasm/reader/zxing_reader.wasm"));
    expect(createHash("sha256").update(wasm).digest("hex")).toBe(actual.ZXING_WASM_SHA256);
  });

  it("the prebuild script copies it to the path the reader loads", async () => {
    const actual = await vi.importActual<typeof import("barcode-detector/ponyfill")>("barcode-detector/ponyfill");
    const { zxingWasmUrl } = await freshReader();
    const cwd = mkdtempSync(join(tmpdir(), "t2q-zxing-"));
    try {
      execFileSync(process.execPath, [join(root, "scripts/copy-zxing-wasm.mjs")], { cwd, stdio: "pipe" });
      const copied = join(cwd, "public", zxingWasmUrl(actual.ZXING_WASM_VERSION));
      expect(existsSync(copied)).toBe(true);
      expect(createHash("sha256").update(readFileSync(copied)).digest("hex")).toBe(actual.ZXING_WASM_SHA256);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("dev and build both prepare it, and git ignores the copy", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.scripts.prebuild).toContain("node scripts/copy-zxing-wasm.mjs");
    expect(pkg.scripts.predev).toContain("node scripts/copy-zxing-wasm.mjs");
    expect(pkg.dependencies["barcode-detector"]).toMatch(/^\d+\.\d+\.\d+$/);
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toMatch(/^\/public\/vendor\/zxing\/$/m);
  });
});

describe("the scanner stays out of every page's first load", () => {
  const src = resolve(__dirname, "../..");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return files(path);
      return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
  const sources = files(src).map((path) => ({ path: relative(src, path), text: readFileSync(path, "utf8") }));
  // Value imports only: an `import type` is erased and ships nothing.
  const staticImport = (spec: RegExp) =>
    sources.filter(({ text }) =>
      new RegExp(`^\\s*import\\s+(?!type\\b)[^;]*?from\\s+["']${spec.source}["']`, "m").test(text),
    );

  it("only barcodeReader.ts touches barcode-detector, and only with a dynamic import", () => {
    expect(staticImport(/barcode-detector(\/[\w-]+)?/)).toEqual([]);
    const users = sources.filter(({ text }) => text.includes("barcode-detector/"));
    expect(users.map((s) => s.path)).toEqual(["lib/materials/barcodeReader.ts"]);
    expect(users[0].text).toMatch(/await import\("barcode-detector\/ponyfill"\)/);
  });

  it("the decoder and the sheet are only ever loaded on demand", () => {
    expect(staticImport(/@\/lib\/materials\/barcodeReader/).map((s) => s.path)).toEqual([]);
    expect(staticImport(/(\.\/|@\/app\/app\/materials\/_components\/)BarcodeScanSheet/).map((s) => s.path)).toEqual([]);
  });
});
