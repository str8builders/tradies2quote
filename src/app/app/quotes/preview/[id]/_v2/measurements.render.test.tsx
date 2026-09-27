// The measurements sheet: working the materials out again from the wall's
// measurements on the job page, in the new look, instead of the classic
// editor's "Takeoff assumptions" panel. Rendered to static HTML in node like
// the page's other markup contracts, one state at a time.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { calculateMaterialTakeoff } from "@/lib/materialCalculator";
import type { QuoteData, QuoteLineItem, TakeoffInputsSnapshot } from "@/lib/quote-types";
import { libraryMaterials, measurementsPatch } from "@/lib/takeoffLines";
import { markupRuleBreaks } from "@/test/design-rules";
import { initialTakeoffForm, takeoffFormInput } from "../_components/TakeoffPanel";
import { withLines } from "./lines";
import type { LibraryPick } from "./types";
import {
  areaWords,
  changeWords,
  checkMeasurements,
  MeasurementsSheet,
  MeasurementsSheetView,
  rowSubtitle,
  type MeasurementsSheetViewProps,
} from "./sheets/MeasurementsSheet";

const noop = () => {};
const applyNoop = async () => ({ ok: true as const });
/** The words a tradie reads, in order. */
const words = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
const count = (markup: string, fragment: string) => markup.split(fragment).length - 1;
/** The opening tag of the first element carrying a fragment. */
const tag = (markup: string, fragment: string) => {
  const at = markup.indexOf(fragment);
  expect(at, `"${fragment}" in markup`).toBeGreaterThanOrEqual(0);
  return markup.slice(markup.lastIndexOf("<", at), markup.indexOf(">", at) + 1);
};

const STORED: TakeoffInputsSnapshot = {
  wallLengthM: 4.8,
  wallHeightM: 2.4,
  studSpacingMm: 600,
  numberOfDoors: 1,
  numberOfWindows: 1,
  gibSides: 2,
  includeInsulation: false,
  includeSkirting: true,
  includeArchitraves: false,
  wastePercent: 10,
};

const line = (over: Partial<QuoteLineItem> & { description: string }): QuoteLineItem => ({
  type: "material",
  quantity: 1,
  unit: "each",
  unit_price: 0,
  line_total: 0,
  ...over,
});

/** A wall quote as generated: priced and unpriced material lines, labour, an extra. */
function wallQuote(over: Partial<QuoteData> = {}): QuoteData {
  return withLines(
    {
      client: { name: "Sam Taylor", address: "14 Rata St", email: "sam@example.invalid", phone: null },
      job_summary: "Frame and GIB a new bedroom wall",
      line_items: [],
      materials_subtotal: 0,
      labour_subtotal: 0,
      markup_pct: 0,
      markup_amount: 0,
      subtotal_before_tax: 0,
      tax_amount: 0,
      total: 0,
      currency: "NZD",
      tax_label: "GST",
      tax_rate: 15,
      terms: "",
      notes: [],
      takeoff_inputs: STORED,
      ...over,
    } as QuoteData,
    over.line_items ?? [
      line({ description: "90x45 SG8 Studs", quantity: 9, unit: "lengths", unit_price: 18.4, price_match_key: "90x45-sg8-studs" }),
      line({ description: "10mm GIB Board", quantity: 7, unit: "sheets", unit_price: 32.5, price_match_key: "10mm-gib-board" }),
      line({ description: "Deck screws", quantity: 2, unit: "box" }),
      line({ type: "labour", description: "Frame and line the wall", quantity: 2, unit: "day", unit_price: 560 }),
      line({ type: "other", description: "Skip bin", quantity: 1, unit: "each", unit_price: 300 }),
    ],
  );
}

const LIBRARY = libraryMaterials([{ id: "lib-gib", name: "10mm GIB Board", unit: "sheet", default_unit_price: 32.5 }]);

function view(over: Partial<MeasurementsSheetViewProps> = {}) {
  const data = over.data ?? wallQuote();
  return renderToStaticMarkup(
    <MeasurementsSheetView
      data={data}
      form={initialTakeoffForm(data.takeoff_inputs)}
      library={LIBRARY}
      tried={false}
      busy={false}
      error={null}
      locked={false}
      onChange={noop}
      onApply={noop}
      onClose={noop}
      {...over}
    />,
  );
}

describe("MeasurementsSheet opens on the stored measurements", () => {
  const markup = renderToStaticMarkup(
    <MeasurementsSheet data={wallQuote()} onApply={applyNoop} onClose={noop} library={LIBRARY} />,
  );

  it("is the sheet the view draws for the stored inputs", () => {
    expect(markup).toBe(view());
  });

  it("fills every box and choice in from takeoff_inputs", () => {
    expect(tag(markup, 'data-box="wallLengthM"')).toContain('value="4.8"');
    expect(tag(markup, 'data-box="wallHeightM"')).toContain('value="2.4"');
    expect(tag(markup, 'data-box="numberOfDoors"')).toContain('value="1"');
    expect(tag(markup, 'data-box="wastePercent"')).toContain('value="10"');
    expect(markup).toMatch(/aria-checked="true"[^>]*>600 mm</);
    expect(markup).toMatch(/aria-checked="true"[^>]*>Both sides</);
    expect(count(markup, 'role="switch" aria-checked="true"')).toBe(1); // skirting only
  });

  it("follows the design rules", () => {
    expect(markupRuleBreaks(markup)).toEqual([]);
  });
});

describe("MeasurementsSheet: what applying writes, before it's tapped", () => {
  const data = wallQuote();
  const markup = view({ data });
  const text = words(markup);

  it("lists each new line beside the current one, then what comes off", () => {
    expect(tag(markup, 'data-testid="job-measurements"')).toContain('data-ready="true"');
    const input = takeoffFormInput(initialTakeoffForm(STORED));
    const studs = calculateMaterialTakeoff(input).materials.find((m) => m.id === "studs-90x45")!;
    expect(text).toContain(`90x45 SG8 Studs Currently 9 lengths. Its price comes off. ${studs.quantity} lengths`);
    expect(text).toContain("10mm GIB Board Same count. Its price comes off. 7 sheets");
    expect(text).toContain("90x45 SG8 Plates New line");
    expect(text).toContain("Deck screws Currently 2 box Comes off");
    expect(count(markup, 'data-change="removed"')).toBe(1);
    expect(markup).not.toContain("Frame and line the wall"); // labour isn't a material line
    expect(text).toMatch(/\d+ changed, \d+ new, 1 coming off\./);
  });

  it("says the wall's area and that prices come off, labour stays", () => {
    expect(text).toContain("Wall area 11.52 m², 8.41 m² without the doors and windows, plus 10% for waste.");
    expect(text).toContain("This takes the prices off 2 material lines.");
    expect(text).toContain("Labour and other lines stay as they are.");
  });

  it("writes exactly the lib's patch for these measurements", () => {
    const check = checkMeasurements(data, initialTakeoffForm(STORED), LIBRARY);
    const input = takeoffFormInput(initialTakeoffForm(STORED));
    expect(check.patch).toEqual(measurementsPatch(data.line_items, calculateMaterialTakeoff(input), input, LIBRARY));
    expect(check.patch?.line_items.find((l) => l.description === "10mm GIB Board")?.library_id).toBe("lib-gib");
  });

  it("follows the design rules", () => {
    expect(markupRuleBreaks(markup)).toEqual([]);
  });
});

describe("MeasurementsSheet states", () => {
  const cases: Array<[string, Partial<MeasurementsSheetViewProps>, string[]]> = [
    [
      "nothing stored yet",
      { data: wallQuote({ takeoff_inputs: undefined }) },
      ["Add the wall length and height to see the materials."],
    ],
    [
      "apply tapped with boxes that can't be used",
      {
        tried: true,
        form: { ...initialTakeoffForm(STORED), wallLengthM: "", wallHeightM: "0", numberOfDoors: "1.5" },
      },
      ["Add the wall length.", "Add a height bigger than 0.", "Use a whole number."],
    ],
    ["saving", { busy: true }, ["Saving…"]],
    ["didn't save", { error: "That didn't save. Check your signal and try again." }, ["That didn't save."]],
    ["accepted", { locked: true }, ["This quote has been accepted, so its lines can't change now."]],
    [
      "a cramped wall",
      { form: { ...initialTakeoffForm(STORED), wallLengthM: "1.2", numberOfDoors: "2", numberOfWindows: "2" } },
      [
        "The doors and windows take up the whole wall.",
        "Check these before you send",
        "Stud count (19) looks off for a 1.2m wall at 600mm centres (expected roughly 3).",
        "You'll be asked to confirm them when you send.",
      ],
    ],
    [
      "insulation on",
      { form: { ...initialTakeoffForm(STORED), includeInsulation: true } },
      ["Pink Batts Insulation New line No count yet", "Insulation can't be worked out here."],
    ],
    [
      "a quote whose quantity check failed",
      {
        data: wallQuote({
          takeoff_evaluation: { status: "fail", reasons: ['"Decking" produced an invalid quantity (NaN).'], confidence: 0.25 },
        }),
      },
      ["These pass the quantity check", "They replace the check that was stopping this quote being sent."],
    ],
    [
      "no priced material lines",
      { data: wallQuote({ line_items: [line({ type: "labour", description: "Labour", quantity: 1, unit: "day", unit_price: 560 })] }) },
      ["The new lines come in without prices.", "You fill them in after."],
    ],
    [
      "measurements the calculator refuses",
      { form: initialTakeoffForm({ ...STORED, wallLengthM: 2e9 }) },
      ["These sizes can't be worked out.", "Check them and try again."],
    ],
  ];

  it.each(cases)("%s: says so in plain words and follows the design rules", (_name, over, expected) => {
    const markup = view(over);
    const text = words(markup);
    for (const phrase of expected) expect(text).toContain(phrase);
    expect(markupRuleBreaks(markup)).toEqual([]);
  });

  it("points at each box that can't be used, only once apply is tapped", () => {
    const form = { ...initialTakeoffForm(STORED), wallLengthM: "", wallHeightM: "0" };
    expect(count(view({ form }), 'aria-invalid="true"')).toBe(0);
    const tried = view({ form, tried: true });
    expect(count(tried, 'aria-invalid="true"')).toBe(2);
    expect(tag(tried, 'data-testid="job-measurements"')).toContain('data-ready="false"');
  });

  it("saving: the button spins and the boxes and switches wait", () => {
    const markup = view({ busy: true });
    expect(tag(markup, 'data-testid="job-measurements-apply"')).toContain('aria-busy="true"');
    expect(tag(markup, 'data-box="wallLengthM"')).toContain("disabled");
    const switches = markup.match(/<button[^>]*role="switch"[^>]*>/g) ?? [];
    expect(switches).toHaveLength(3);
    for (const s of switches) expect(s).toContain('disabled=""');
  });

  it("accepted: nothing to tap but Close", () => {
    const markup = view({ locked: true });
    expect(tag(markup, 'data-testid="job-measurements-apply"')).toContain("disabled");
    expect(tag(markup, 'data-box="wallHeightM"')).toContain("disabled");
  });

  it("didn't save: the reason is announced", () => {
    expect(view({ error: "That didn't save. Check your signal and try again." })).toContain('role="alert"');
  });

  it("a failing check is shown, never hidden", () => {
    const data = wallQuote();
    const check = checkMeasurements(data, initialTakeoffForm(STORED), LIBRARY);
    expect(check.patch?.takeoff_evaluation.status).toBe("pass");
    // Nothing to say when the quote had no failed or cautious check before.
    expect(words(view({ data }))).not.toContain("quantity check");
  });
});

describe("the job page's library rows", () => {
  it("fit the sheet and link the new lines like the classic library", () => {
    const picks: LibraryPick[] = [{ id: "lib-gib", name: "10mm GIB Board", unit: "sheet", default_unit_price: 32.5 }];
    const markup = renderToStaticMarkup(<MeasurementsSheet data={wallQuote()} onApply={applyNoop} onClose={noop} library={picks} />);
    expect(markup).toBe(view());
    const check = checkMeasurements(wallQuote(), initialTakeoffForm(STORED), libraryMaterials(picks));
    expect(check.patch?.line_items.find((l) => l.description === "10mm GIB Board")?.library_id).toBe("lib-gib");
  });

  it("without a library the lines still come in, unlinked", () => {
    const markup = renderToStaticMarkup(<MeasurementsSheet data={wallQuote()} onApply={applyNoop} onClose={noop} />);
    expect(tag(markup, 'data-testid="job-measurements"')).toContain('data-ready="true"');
    const check = checkMeasurements(wallQuote(), initialTakeoffForm(STORED), []);
    expect(check.patch?.line_items.every((l) => l.type !== "material" || l.library_id === null)).toBe(true);
  });
});

describe("checkMeasurements", () => {
  it("works nothing out until every box can be used", () => {
    const check = checkMeasurements(wallQuote(), { ...initialTakeoffForm(STORED), wallHeightM: "" }, LIBRARY);
    expect(check).toMatchObject({ result: null, patch: null, rows: [], problems: { wallHeightM: "Add a height bigger than 0." } });
  });

  it("reads a typed length that isn't above 0 differently from an empty box", () => {
    const typed = checkMeasurements(wallQuote(), { ...initialTakeoffForm(STORED), wallLengthM: "0" }, LIBRARY);
    expect(typed.problems.wallLengthM).toBe("Add a length bigger than 0.");
  });
});

describe("the sheet's words", () => {
  it("areaWords leaves out what isn't there", () => {
    expect(areaWords({ wallAreaM2: 12, openingAreaM2: 0, netWallAreaM2: 12, wastePercent: 0 })).toBe("Wall area 12 m².");
    expect(areaWords({ wallAreaM2: 11.52, openingAreaM2: 3.11, netWallAreaM2: 8.41, wastePercent: 12.5 })).toBe(
      "Wall area 11.52 m², 8.41 m² without the doors and windows, plus 12.5% for waste.",
    );
  });

  it("rowSubtitle says what the quote has now, and when a price comes off", () => {
    const priced = line({ description: "Studs", quantity: 9, unit: "lengths", unit_price: 18.4 });
    const bare = line({ description: "Studs", quantity: 9, unit: "lengths" });
    const next = line({ description: "Studs", quantity: 17, unit: "lengths" });
    expect(rowSubtitle({ change: "added", line: next })).toBe("New line");
    expect(rowSubtitle({ change: "changed", line: next, before: bare })).toBe("Currently 9 lengths");
    expect(rowSubtitle({ change: "changed", line: next, before: priced })).toBe("Currently 9 lengths. Its price comes off.");
    expect(rowSubtitle({ change: "same", line: bare, before: bare })).toBe("No change");
    expect(rowSubtitle({ change: "same", line: bare, before: priced })).toBe("Same count. Its price comes off.");
    expect(rowSubtitle({ change: "removed", line: priced })).toBe("Currently 9 lengths");
  });

  it("changeWords counts what changes", () => {
    const l = line({ description: "x" });
    expect(changeWords([])).toBe("No change to your material lines.");
    expect(changeWords([{ change: "same", line: l, before: l }])).toBe("No change to your material lines.");
    expect(
      changeWords([
        { change: "changed", line: l, before: l },
        { change: "added", line: l },
        { change: "added", line: l },
        { change: "removed", line: l },
      ]),
    ).toBe("1 changed, 2 new, 1 coming off.");
  });
});
