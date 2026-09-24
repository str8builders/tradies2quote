// Self-host the ZXing reader .wasm used by the barcode scanner.
//
// The `barcode-detector` ponyfill would fetch its .wasm from a CDN; the app
// serves it from our own origin instead (src/lib/materials/barcodeReader.ts
// points `locateFile` at /vendor/zxing/<version>/zxing_reader.wasm). This runs
// before `next dev` and `next build` (predev / prebuild) and copies the file
// out of node_modules. The copy is git-ignored.
//
// The .wasm must be the exact build the ponyfill's bundled glue code expects,
// so its SHA-256 is checked against ZXING_WASM_SHA256 and a mismatch fails
// the build rather than shipping a scanner that cannot start.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const ponyfillPath = require.resolve("barcode-detector/ponyfill");
const { ZXING_WASM_SHA256, ZXING_WASM_VERSION } = await import("barcode-detector/ponyfill");

// Resolve zxing-wasm from barcode-detector's own location, so a nested copy
// (if npm ever installs one) wins over a hoisted one of another version.
const source = createRequire(ponyfillPath).resolve("zxing-wasm/reader/zxing_reader.wasm");
const bytes = await readFile(source);
const sha256 = createHash("sha256").update(bytes).digest("hex");
if (sha256 !== ZXING_WASM_SHA256) {
  console.error(
    `zxing_reader.wasm (${source}) is not the build barcode-detector expects ` +
      `(sha256 ${sha256}, expected ${ZXING_WASM_SHA256}). Reinstall with npm ci.`,
  );
  process.exit(1);
}

const target = resolve("public/vendor/zxing", ZXING_WASM_VERSION, "zxing_reader.wasm");
await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
console.log(`Prepared local zxing-wasm ${ZXING_WASM_VERSION} reader`);
