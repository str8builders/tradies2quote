/**
 * Barcode decoding for the scanner sheet. Browser-only.
 *
 * Nothing imports this module statically: the scanner sheet loads it with a
 * dynamic import when it opens, so no page ships the decoder up front.
 *
 *  - Chrome on Android has a native `BarcodeDetector`; it is used when it
 *    reads every retail format.
 *  - Safari, the iOS app (WKWebView) and desktop browsers without one get the
 *    `barcode-detector` ponyfill (ZXing compiled to WebAssembly). Its .wasm is
 *    SELF-HOSTED: `scripts/copy-zxing-wasm.mjs` copies it into
 *    `public/vendor/zxing/<version>/` before dev and build, and `locateFile`
 *    points there — the package's default CDN is never contacted.
 */

/** Formats the scanner asks for (BarcodeDetector names). */
export const SCAN_FORMATS = [
  "ean_13",
  "ean_8",
  "upc_a",
  "upc_e",
  "code_128",
  "code_39",
  "itf",
  "qr_code",
] as const;

/**
 * A native detector is only trusted when it reads all of these. UPC-A is not
 * listed: its symbol is an EAN-13 with a leading 0, so an EAN-13 reader reads
 * it (Apple's detector in Chrome on a Mac reports it that way) and
 * normalizeBarcode stores both forms as the same code.
 */
export const REQUIRED_NATIVE_FORMATS = ["ean_13", "ean_8", "upc_e", "code_128"] as const;

export type ReaderKind = "native" | "wasm";
export type DecodedBarcode = { rawValue: string; format: string };
export type BarcodeImage =
  | HTMLCanvasElement
  | HTMLVideoElement
  | HTMLImageElement
  | ImageBitmap
  | ImageData;

export interface BarcodeReader {
  kind: ReaderKind;
  detect(image: BarcodeImage): Promise<DecodedBarcode[]>;
}

/** The .wasm could not be fetched or compiled (offline, blocked, missing). */
export class BarcodeReaderUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("The barcode reader didn't load.", options);
    this.name = "BarcodeReaderUnavailableError";
  }
}

export function chooseReaderKind(nativeFormats: readonly string[] | null | undefined): ReaderKind {
  if (!nativeFormats) return "wasm";
  return REQUIRED_NATIVE_FORMATS.every((f) => nativeFormats.includes(f)) ? "native" : "wasm";
}

/** Same-origin path of the reader .wasm (see scripts/copy-zxing-wasm.mjs). */
export function zxingWasmUrl(version: string): string {
  return `/vendor/zxing/${encodeURIComponent(version)}/zxing_reader.wasm`;
}

type Size = { width: number; height: number };
export type CropRect = { x: number; y: number; width: number; height: number };

/**
 * The part of a camera frame that is visible in a viewport showing the video
 * with `object-fit: cover` — the middle of the frame, trimmed to the
 * viewport's shape. Decoding only this keeps the reader on what the tradie is
 * pointing at (and gives the WebAssembly reader fewer pixels). Null until the
 * camera has produced a frame.
 */
export function frameCropRect(video: Size, view: Size): CropRect | null {
  if (!(video.width > 0 && video.height > 0 && view.width > 0 && view.height > 0)) return null;
  const viewIsWider = view.width / view.height > video.width / video.height;
  const width = viewIsWider ? video.width : (video.height * view.width) / view.height;
  const height = viewIsWider ? (video.width * view.height) / view.width : video.height;
  const x = Math.round((video.width - width) / 2);
  const y = Math.round((video.height - height) / 2);
  return { x, y, width: Math.round(width), height: Math.round(height) };
}

type RawDetection = { rawValue?: unknown; format?: unknown };
type NativeDetectorCtor = {
  new (options?: { formats?: string[] }): { detect(image: BarcodeImage): Promise<RawDetection[]> };
  getSupportedFormats?: () => Promise<string[]>;
};

function simplify(results: readonly RawDetection[]): DecodedBarcode[] {
  return results
    .filter((r) => typeof r.rawValue === "string")
    .map((r) => ({
      rawValue: r.rawValue as string,
      format: typeof r.format === "string" ? r.format : "unknown",
    }));
}

async function nativeReader(): Promise<BarcodeReader | null> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector;
  if (typeof Native !== "function" || typeof Native.getSupportedFormats !== "function") return null;
  try {
    const supported = await Native.getSupportedFormats();
    if (chooseReaderKind(supported) !== "native") return null;
    const detector = new Native({ formats: SCAN_FORMATS.filter((f) => supported.includes(f)) });
    return { kind: "native", detect: async (image) => simplify(await detector.detect(image)) };
  } catch {
    return null; // a broken native detector falls back to the WebAssembly reader
  }
}

async function wasmReader(): Promise<BarcodeReader> {
  const zxing = await import("barcode-detector/ponyfill");
  const wasmUrl = zxingWasmUrl(zxing.ZXING_WASM_VERSION);
  try {
    // Must run before the first BarcodeDetector is built: the ponyfill starts
    // loading the module in its constructor, with whatever overrides are set.
    await zxing.prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
      },
      fireImmediately: true,
    });
  } catch (cause) {
    zxing.purgeZXingModule(); // forget the failed module so the next open fetches again
    throw new BarcodeReaderUnavailableError({ cause });
  }
  const detector = new zxing.BarcodeDetector({ formats: [...SCAN_FORMATS] });
  return { kind: "wasm", detect: async (image) => simplify(await detector.detect(image)) };
}

let loading: Promise<BarcodeReader> | null = null;

/** The reader for this page, created once and reused by every scan. */
export function loadBarcodeReader(): Promise<BarcodeReader> {
  loading ??= (async () => (await nativeReader()) ?? (await wasmReader()))().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}

/** Longest side handed to the reader: plenty for a barcode, light on a phone. */
const MAX_FRAME_EDGE = 1280;
const MAX_PHOTO_EDGE = 2000;

export type Scanner = {
  kind: ReaderKind;
  /** Read the visible part of the live video. Null until it has a frame. */
  readFrame(video: HTMLVideoElement, view: Size): Promise<DecodedBarcode[] | null>;
  /** Read a still photo of a barcode (scaled down first). */
  readPhoto(file: Blob): Promise<DecodedBarcode[]>;
};

type DecodedImage = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decodeImage(file: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // Fall back to an <img> (older Safari can't build a bitmap from every file).
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

/**
 * Wraps a reader with the canvas work: crop the live frame to what the
 * viewport shows, scale big images down, and hand the WebAssembly reader raw
 * pixels (a native detector reads the canvas itself).
 */
export function createScanner(
  reader: BarcodeReader,
  makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas"),
): Scanner {
  let frameCanvas: HTMLCanvasElement | null = null;

  function draw(
    canvas: HTMLCanvasElement,
    source: CanvasImageSource,
    crop: CropRect,
    maxEdge: number,
  ): HTMLCanvasElement | ImageData {
    const scale = Math.min(1, maxEdge / Math.max(crop.width, crop.height));
    const width = Math.max(1, Math.round(crop.width * scale));
    const height = Math.max(1, Math.round(crop.height * scale));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("No 2D canvas");
    ctx.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    return reader.kind === "wasm" ? ctx.getImageData(0, 0, width, height) : canvas;
  }

  return {
    kind: reader.kind,
    async readFrame(video, view) {
      if (video.readyState < 2) return null; // HAVE_CURRENT_DATA
      const crop = frameCropRect({ width: video.videoWidth, height: video.videoHeight }, view);
      if (!crop) return null;
      frameCanvas ??= makeCanvas();
      return reader.detect(draw(frameCanvas, video, crop, MAX_FRAME_EDGE));
    },
    async readPhoto(file) {
      const image = await decodeImage(file);
      try {
        const whole = { x: 0, y: 0, width: image.width, height: image.height };
        return await reader.detect(draw(makeCanvas(), image.source, whole, MAX_PHOTO_EDGE));
      } finally {
        image.release();
      }
    },
  };
}
