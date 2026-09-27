// The plan reader in the current look (<ScanPanel>, on the old-look new-quote
// page). The snapshot was taken from the untouched component, before its
// logic moved into useScanPanel for the new look's <PlanReader>, so the old
// look provably renders exactly as it did. Regenerate only after an intended
// change to the old look: npx vitest run <this file> --update

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ScanPanel } from "./ScanPanel";

describe("ScanPanel (old look) renders exactly as before", () => {
  it("setup", async () => {
    const out = renderToStaticMarkup(<ScanPanel transcript="" setTranscript={() => {}} />);
    await expect(out).toMatchFileSnapshot("./__snapshots__/ScanPanel.classic.setup.html");
  });
});
