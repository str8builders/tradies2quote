/**
 * Site fonts for the marketing renders: Plus Jakarta Sans (headlines and the
 * app UI), IBM Plex Sans (body) and IBM Plex Mono (labels). Loaded through
 * @remotion/google-fonts, which holds the render until the files arrive.
 *
 * A render must never silently fall back to a system font, so once loading
 * settles every face we rely on is checked and the render is cancelled if one
 * is missing. Remotion-only: the website must not import this module.
 */
import { cancelRender, continueRender, delayRender } from "remotion";
import { loadFont as loadJakarta } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as loadPlexSans } from "@remotion/google-fonts/IBMPlexSans";
import { loadFont as loadPlexMono } from "@remotion/google-fonts/IBMPlexMono";

const JAKARTA_WEIGHTS = ["400", "500", "600", "700", "800"] as const;
const PLEX_WEIGHTS = ["400", "500", "600"] as const;

const jakarta = loadJakarta("normal", { weights: [...JAKARTA_WEIGHTS], subsets: ["latin"] });
const plexSans = loadPlexSans("normal", { weights: [...PLEX_WEIGHTS], subsets: ["latin"] });
const plexMono = loadPlexMono("normal", { weights: [...PLEX_WEIGHTS], subsets: ["latin"] });

export const fontFamilies = {
  display: jakarta.fontFamily,
  body: plexSans.fontFamily,
  mono: plexMono.fontFamily,
} as const;

function unquote(family: string) {
  return family.replace(/["']/g, "").trim();
}

if (typeof document !== "undefined") {
  const handle = delayRender("Verifying marketing fonts");
  Promise.all([jakarta.waitUntilDone(), plexSans.waitUntilDone(), plexMono.waitUntilDone()])
    .then(() => {
      const loaded = new Set<string>();
      document.fonts.forEach((face) => {
        if (face.status === "loaded") loaded.add(`${unquote(face.family)}|${face.weight}`);
      });
      const required = [
        ...JAKARTA_WEIGHTS.map((w) => `${unquote(jakarta.fontFamily)}|${w}`),
        ...PLEX_WEIGHTS.map((w) => `${unquote(plexSans.fontFamily)}|${w}`),
        ...PLEX_WEIGHTS.map((w) => `${unquote(plexMono.fontFamily)}|${w}`),
      ];
      const missing = required.filter((key) => !loaded.has(key));
      if (missing.length > 0) {
        cancelRender(new Error(`Marketing fonts did not load: ${missing.join(", ")}`));
        return;
      }
      continueRender(handle);
    })
    .catch((error: unknown) => cancelRender(error));
}
