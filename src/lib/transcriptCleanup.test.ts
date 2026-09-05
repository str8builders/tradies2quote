import { describe, it, expect, vi } from "vitest";
import {
  applyDeterministicCorrections,
  buildSummary,
  cleanTranscript,
} from "./transcriptCleanup";

// ===========================================================================
// Glossary vocab integration — optional, backwards-compatible
// ===========================================================================

describe("applyDeterministicCorrections — vocab glossary pass", () => {
  const vocab = {
    entries: [
      {
        canonical: "PlaceMakers",
        aliases: ["place makers"],
        type: "supplier" as const,
        source: "global" as const,
      },
    ],
  };

  it("is unchanged from legacy behaviour when no vocab is passed", () => {
    const r = applyDeterministicCorrections("order from place makers");
    expect(r.cleanedTranscript).toContain("place makers");
    expect(r.corrections).toHaveLength(0);
  });

  it("applies glossary corrections when vocab is passed, tagging source", () => {
    const r = applyDeterministicCorrections("order from place makers", vocab);
    expect(r.cleanedTranscript).toContain("PlaceMakers");
    const c = r.corrections.find((x) => x.after === "PlaceMakers");
    expect(c?.source).toBe("global");
    expect(c?.confidence).toBeGreaterThan(0);
  });

  it("tags regex-origin corrections with source 'regex'", () => {
    const r = applyDeterministicCorrections("framing in h32 pine", vocab);
    const reg = r.corrections.find((x) => x.after === "H3.2");
    expect(reg?.source).toBe("regex");
  });
});

// ===========================================================================
// applyDeterministicCorrections — no LLM, fully testable
// ===========================================================================

describe("applyDeterministicCorrections — H-class normalisation", () => {
  it("h32 → H3.2", () => {
    const r = applyDeterministicCorrections("Build a 6m wall in h32 framing pine");
    expect(r.cleanedTranscript).toContain("H3.2 framing pine");
    expect(r.corrections.find((c) => c.before.toLowerCase() === "h32" && c.after === "H3.2")).toBeDefined();
  });

  it("h12 → H1.2 (internal framing)", () => {
    const r = applyDeterministicCorrections("h12 90x45 framing for the bedroom");
    expect(r.cleanedTranscript).toContain("H1.2 90x45 framing");
  });

  it("h31 → H3.1", () => {
    expect(applyDeterministicCorrections("h31 fence rail").cleanedTranscript).toContain("H3.1 fence rail");
  });

  it("h42 → H4.2", () => {
    expect(applyDeterministicCorrections("h42 pergola post").cleanedTranscript).toContain("H4.2 pergola post");
  });

  it("h52 → H5.2", () => {
    expect(applyDeterministicCorrections("h52 retaining timber").cleanedTranscript).toContain("H5.2 retaining timber");
  });

  it("standalone h3/h4/h5 capitalised", () => {
    const r = applyDeterministicCorrections("h4 post 100x100, h5 pile, h3 paling");
    expect(r.cleanedTranscript).toContain("H4 post");
    expect(r.cleanedTranscript).toContain("H5 pile");
    expect(r.cleanedTranscript).toContain("H3 paling");
  });

  it("does NOT collapse H32 to H3 or H3.2 to H3 (keeps decimal precision)", () => {
    const r = applyDeterministicCorrections("h32 deck joist and h3 paling");
    // Both classes survive intact — H3.2 stayed H3.2, h3 became H3.
    expect(r.cleanedTranscript).toContain("H3.2 deck joist");
    expect(r.cleanedTranscript).toContain("H3 paling");
    // Defence-in-depth: the H3.2 fragment didn't lose its decimal.
    expect(r.cleanedTranscript).toContain("H3.2");
    // And the h32 → H3 (without decimal) bug isn't present — we
    // shouldn't see "H3 deck" because the H32 must have produced H3.2.
    expect(r.cleanedTranscript).not.toContain("H3 deck");
  });
});

describe("applyDeterministicCorrections — plasterboard brand normalisation", () => {
  it("'jib sheets 13mm' → GIB (with sheet context)", () => {
    const r = applyDeterministicCorrections("12 jib sheets 2400x1200 13mm in the ceiling");
    expect(r.cleanedTranscript).toContain("GIB sheets");
    expect(r.corrections.find((c) => c.type === "brand_plasterboard")).toBeDefined();
  });

  it("'gyp boards' → GIB (with board context)", () => {
    expect(
      applyDeterministicCorrections("gyp boards on the wall lining").cleanedTranscript,
    ).toContain("GIB boards");
  });

  it("'jib' standalone (no plasterboard context) → leaves alone + clarification", () => {
    const r = applyDeterministicCorrections("the jib of the project");
    expect(r.cleanedTranscript).toBe("the jib of the project");
    expect(
      r.clarificationQuestions.some((q) => q.id.startsWith("transcript.gib.")),
    ).toBe(true);
  });

  it("'job' is NOT auto-corrected to GIB (English noun is the default reading)", () => {
    const r = applyDeterministicCorrections("come finish the job tomorrow");
    expect(r.cleanedTranscript).toContain("job");
    expect(r.corrections.find((c) => c.before === "job" && c.after === "GIB")).toBeUndefined();
  });

  it("'Job type:' scaffold is never rewritten to 'GIB type:' (regression — was ~16% of live quotes)", () => {
    // Reproduces the exact production failure: the "Job type:" label sits
    // near a digit ("stock_length_m=6") and the word "board" ("Calculate
    // board"), which previously tripped the job→GIB rule.
    const raw =
      "[T2Q_TIMBER] stock_length_m=6\n\nJob type: Deck.\n\nTradie buys timber in 6m lengths. Calculate board / stud / plate / decking counts.";
    const r = applyDeterministicCorrections(raw);
    expect(r.cleanedTranscript).toContain("Job type: Deck");
    expect(r.cleanedTranscript).not.toContain("GIB type");
    expect(
      r.corrections.find((c) => c.before.toLowerCase() === "job"),
    ).toBeUndefined();
  });
});

describe("applyDeterministicCorrections — Pink Batts", () => {
  it("'pink bats R2.6 in ceiling' → Pink Batts (insulation context)", () => {
    const r = applyDeterministicCorrections("pink bats R2.6 in the ceiling");
    expect(r.cleanedTranscript).toContain("Pink Batts");
    expect(
      r.corrections.find((c) => c.before.toLowerCase() === "pink bats" && c.after === "Pink Batts"),
    ).toBeDefined();
  });

  it("'pink-bats' (hyphen) also normalises", () => {
    expect(
      applyDeterministicCorrections("pink-bats wall thermal").cleanedTranscript,
    ).toContain("Pink Batts");
  });

  it("'pink bats' near 'H3.2 batten' → emits clarification, keeps original", () => {
    const r = applyDeterministicCorrections("H3.2 50x50 batten and pink bats");
    expect(r.cleanedTranscript).toContain("pink bats");
    expect(
      r.clarificationQuestions.some((q) => q.id.startsWith("transcript.batts.")),
    ).toBe(true);
  });
});

describe("applyDeterministicCorrections — battens vs Pink Batts (regression)", () => {
  it("'H3.2 50x50 batten' alone → leaves as timber, no Pink Batts conversion", () => {
    const r = applyDeterministicCorrections("H3.2 50x50 batten 2.4m");
    expect(r.cleanedTranscript).toContain("batten");
    expect(r.corrections.find((c) => c.type === "brand_insulation")).toBeUndefined();
  });
});

describe("applyDeterministicCorrections — size normalisation", () => {
  it("'90 by 45' → '90x45'", () => {
    expect(applyDeterministicCorrections("90 by 45 framing").cleanedTranscript).toContain("90x45 framing");
  });

  it("'140 × 45' (Unicode times) → '140x45'", () => {
    expect(applyDeterministicCorrections("140 × 45 joist").cleanedTranscript).toContain("140x45 joist");
  });

  it("'90 - 45' → does NOT match (dash isn't a size separator)", () => {
    expect(applyDeterministicCorrections("90 - 45 framing").cleanedTranscript).toContain("90 - 45");
  });

  it("'90x45' is unchanged (already canonical, no correction emitted)", () => {
    const r = applyDeterministicCorrections("90x45 framing pine");
    expect(r.cleanedTranscript).toContain("90x45");
    expect(r.corrections.find((c) => c.type === "size")).toBeUndefined();
  });

  it("'13 mil GIB' → '13mm GIB'", () => {
    expect(
      applyDeterministicCorrections("13 mil GIB standard").cleanedTranscript,
    ).toContain("13mm GIB");
  });

  it("'12 mils ply' and '18 millimetres' → mm", () => {
    expect(applyDeterministicCorrections("12 mils ply").cleanedTranscript).toContain("12mm ply");
    expect(
      applyDeterministicCorrections("18 millimetres particleboard").cleanedTranscript,
    ).toContain("18mm particleboard");
  });

  it("'12 mm' (spaced) tightens to '12mm'", () => {
    expect(applyDeterministicCorrections("12 mm ply").cleanedTranscript).toContain("12mm ply");
  });

  it("'12mm' is unchanged (already canonical, no correction emitted)", () => {
    const r = applyDeterministicCorrections("12mm ply");
    expect(r.cleanedTranscript).toContain("12mm");
    expect(r.corrections.find((c) => c.before === "12mm")).toBeUndefined();
  });

  it("does NOT mangle 'million' (no false mil→mm match)", () => {
    expect(
      applyDeterministicCorrections("2 million dollar build").cleanedTranscript,
    ).toContain("2 million");
  });
});

describe("applyDeterministicCorrections — empty input", () => {
  it("empty raw → empty cleaned + zero corrections + zero clarifications", () => {
    expect(applyDeterministicCorrections("")).toEqual({
      cleanedTranscript: "",
      corrections: [],
      clarificationQuestions: [],
    });
  });
});

describe("applyDeterministicCorrections — corrections sorted by position", () => {
  it("multiple corrections sorted in raw-text order", () => {
    const r = applyDeterministicCorrections("h32 framing and pink bats R2.6 in ceiling and h12 stud");
    const positions = r.corrections.map((c) => c.index);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });
});

// ===========================================================================
// buildSummary — configured text model with mocked transport
// ===========================================================================

describe("buildSummary — text model via mock transport", () => {
  const validResponse = `{
    "job_type": "Internal partition framing",
    "site_or_client": null,
    "dimensions": "6m x 2.7m",
    "surface_context": "wall",
    "exposure_context": "internal",
    "material_assumptions": ["GIB Standard 13mm assumed"],
    "missing_information": ["wall thermal envelope status"],
    "compliance_risks": ["confirm acoustic requirement"],
    "confidence": 0.78
  }`;

  it("parses a well-formed response into TranscriptSummary", async () => {
    const summary = await buildSummary("clean text", {
      apiKey: "fake",
      callAnthropic: async () => validResponse,
    });
    expect(summary).not.toBeNull();
    expect(summary?.job_type).toBe("Internal partition framing");
    expect(summary?.dimensions).toBe("6m x 2.7m");
    expect(summary?.material_assumptions).toEqual(["GIB Standard 13mm assumed"]);
    expect(summary?.confidence).toBe(0.78);
  });

  it("clamps confidence to [0, 1]", async () => {
    const out = await buildSummary("text", {
      apiKey: "fake",
      callAnthropic: async () => `{"confidence": 5}`,
    });
    expect(out?.confidence).toBe(1);
  });

  it("returns null when JSON is malformed (no throw)", async () => {
    const out = await buildSummary("text", {
      apiKey: "fake",
      callAnthropic: async () => `not json`,
    });
    expect(out).toBeNull();
  });

  it("returns null when transport throws (no throw)", async () => {
    const out = await buildSummary("text", {
      apiKey: "fake",
      callAnthropic: async () => {
        throw new Error("network");
      },
    });
    expect(out).toBeNull();
  });

  it("returns null when API key is missing", async () => {
    const out = await buildSummary("text", {
      callAnthropic: async () => validResponse,
      // apiKey intentionally omitted, env var unset in test
    });
    // env may have a local key set in dev — only assert when unset.
    if (!process.env.LOCAL_LLM_API_KEY) {
      expect(out).toBeNull();
    }
  });
});

// ===========================================================================
// cleanTranscript — orchestrator (failsafe)
// ===========================================================================

describe("cleanTranscript — orchestrator", () => {
  it("summaryDisabled=true → no LLM call, det pass only, fallback='summary_disabled'", async () => {
    const r = await cleanTranscript("h32 framing 90 by 45", {
      summaryDisabled: true,
    });
    expect(r.cleanedTranscript).toContain("H3.2 framing 90x45");
    expect(r.summary).toBeNull();
    expect(r.fallback).toBe("summary_disabled");
    expect(r.confidence).toBeGreaterThan(0);
  });

  it("LLM transport throws → fallback='summary_failed', det pass still applied", async () => {
    const r = await cleanTranscript("h32 framing 90 by 45", {
      apiKey: "fake",
      callAnthropic: async () => {
        throw new Error("upstream offline");
      },
    });
    expect(r.cleanedTranscript).toContain("H3.2 framing 90x45");
    expect(r.summary).toBeNull();
    expect(r.fallback).toBe("summary_failed");
  });

  it("clarifications drag confidence below summary's stated value", async () => {
    const r = await cleanTranscript(
      "the jib of the project", // standalone jib triggers clarification
      {
        apiKey: "fake",
        callAnthropic: async () => `{"confidence": 0.9}`,
      },
    );
    // 0.9 - 0.1 (one clarification) = 0.8
    expect(r.clarificationQuestions.length).toBe(1);
    expect(r.confidence).toBeLessThan(0.9);
  });

  it("happy path with mocked text model returns full shape", async () => {
    const callAnthropic = vi.fn().mockResolvedValue(`{"job_type":"Wall","confidence":0.9}`);
    const r = await cleanTranscript("h32 framing 90 by 45", {
      apiKey: "fake",
      callAnthropic,
    });
    expect(r.cleanedTranscript).toContain("H3.2 framing 90x45");
    expect(r.summary?.job_type).toBe("Wall");
    expect(callAnthropic).toHaveBeenCalledOnce();
  });
});
