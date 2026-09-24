/**
 * Quote video fonts: Archivo Black (headings) and IBM Plex Sans (text) from
 * Google Fonts through @remotion/google-fonts, including latin-ext so Māori
 * macrons (ā ē ī ō ū) render in names and job lines.
 *
 * Loaded when the QuoteVideo component mounts rather than at module load, so
 * the marketing compositions in the same bundle never wait on these files.
 * A render must not silently fall back to a system font: once loading settles
 * every face is checked and the render is cancelled if one is missing (the
 * worker then retries the job).
 */
import { useEffect, useState } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";
import { fontFamily as archivoFamily, loadFont as loadArchivoBlack } from "@remotion/google-fonts/ArchivoBlack";
import { fontFamily as plexFamily, loadFont as loadPlexSans } from "@remotion/google-fonts/IBMPlexSans";

const PLEX_WEIGHTS = ["400", "500", "600", "700"] as const;
const SUBSETS = ["latin", "latin-ext"] as const;

export const QV_FONT = {
  display: `"${archivoFamily}", "Arial Black", sans-serif`,
  body: `"${plexFamily}", "Helvetica Neue", Arial, sans-serif`,
} as const;

const unquote = (family: string) => family.replace(/["']/g, "").trim();

let loading: Promise<void> | null = null;

function loadQuoteVideoFonts(): Promise<void> {
  if (!loading) {
    const archivo = loadArchivoBlack("normal", { weights: ["400"], subsets: [...SUBSETS] });
    const plex = loadPlexSans("normal", { weights: [...PLEX_WEIGHTS], subsets: [...SUBSETS] });
    loading = Promise.all([archivo.waitUntilDone(), plex.waitUntilDone()]).then(() => {
      const loaded = new Set<string>();
      document.fonts.forEach((face) => {
        if (face.status === "loaded") loaded.add(`${unquote(face.family)}|${face.weight}`);
      });
      const required = [`${archivoFamily}|400`, ...PLEX_WEIGHTS.map((w) => `${plexFamily}|${w}`)];
      const missing = required.filter((key) => !loaded.has(key));
      if (missing.length > 0) throw new Error(`Quote video fonts did not load: ${missing.join(", ")}`);
    });
  }
  return loading;
}

/** Holds the render until both families are loaded and verified. */
export function useQuoteVideoFonts(): void {
  const [handle] = useState(() => delayRender("Loading quote video fonts", { timeoutInMilliseconds: 90_000 }));
  useEffect(() => {
    loadQuoteVideoFonts()
      .then(() => continueRender(handle))
      .catch((error: unknown) => cancelRender(error));
  }, [handle]);
}
