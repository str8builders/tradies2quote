---
name: nz-building-takeoff
description: Use this skill when working on NZ building, tradie, quote, estimate, material takeoff, framing, GIB, insulation, skirting, architraves, labour, GST, or supplier-price calculation features. This skill adds reusable material calculation logic to an existing app without rebuilding the UI.
---

# NZ Building Takeoff Skill

Purpose:
Add, debug, or improve material calculation logic inside an existing NZ building quote app.

Core rule:
AI reads the project description.
The calculator does the maths.
The quote engine prices the result.
AI must not invent final material quantities.

## Where the logic lives

- Pure calculation: `src/lib/materialCalculator.ts`
- Public function: `calculateMaterialTakeoff(input: MaterialTakeoffInput): MaterialTakeoffResult`
- Tests: `src/lib/materialCalculator.test.ts`
- UI integration: takeoff panel + "Recalculate Materials" button in `src/app/app/quotes/preview/[id]/_components/QuoteEditor.tsx`
- Library price match: `matchToLibrary` in `src/lib/materials.ts` (token-overlap by name, library row keyed by `(user_id, lower(name))`)

## Supported job types (this version)

- internal wall framing
- GIB lining
- insulation
- skirting
- architraves

## Inputs

```ts
export type MaterialTakeoffInput = {
  wallLengthM: number;
  wallHeightM?: number;
  studSpacingMm?: number;
  numberOfDoors?: number;
  numberOfWindows?: number;
  gibSides?: 1 | 2;
  includeInsulation?: boolean;
  includeSkirting?: boolean;
  includeArchitraves?: boolean;
  wastePercent?: number;
  timberStockLengthM?: number;
  gibSheetWidthM?: number;
  gibSheetHeightM?: number;
  insulationPackCoverageM2?: number;
  doorWidthM?: number;
  doorHeightM?: number;
  windowWidthM?: number;
  windowHeightM?: number;
};
```

## Defaults

```ts
const DEFAULTS = {
  wallHeightM: 2.4,
  studSpacingMm: 600,
  numberOfDoors: 0,
  numberOfWindows: 0,
  gibSides: 2,
  includeInsulation: true,
  includeSkirting: false,
  includeArchitraves: false,
  wastePercent: 10,
  timberStockLengthM: 4.8,
  gibSheetWidthM: 1.2,
  gibSheetHeightM: 2.4,
  insulationPackCoverageM2: 8.8,
  doorWidthM: 0.82,
  doorHeightM: 2.04,
  windowWidthM: 1.2,
  windowHeightM: 1.2,
};
```

## Output

```ts
export type MaterialTakeoffResult = {
  summary: {
    wallAreaM2: number;
    openingAreaM2: number;
    netWallAreaM2: number;
    wastePercent: number;
  };
  materials: {
    id: string;
    name: string;
    category: string;
    quantity: number;
    unit: string;
    formula: string;
    notes?: string;
    priceMatchKey?: string;
  }[];
  warnings: string[];
};
```

## Formula rules (authoritative)

1. **Wall area** — `wallAreaM2 = wallLengthM * wallHeightM`
2. **Openings** —
   - `doorAreaM2 = numberOfDoors * doorWidthM * doorHeightM`
   - `windowAreaM2 = numberOfWindows * windowWidthM * windowHeightM`
   - `openingAreaM2 = doorAreaM2 + windowAreaM2`
   - `netWallAreaM2 = max(wallAreaM2 - openingAreaM2, 0)`
3. **Studs** — `baseStuds = ceil((wallLengthM * 1000) / studSpacingMm) + 1`; `openingStuds = numberOfDoors * 4 + numberOfWindows * 4`; `studCount = baseStuds + openingStuds`
4. **Plates** — `plateLengths = ceil((wallLengthM * 3) / timberStockLengthM)` (3 rows: bottom + top + cap)
5. **Nogs (dwangs)** — one row per 1.35 m (max) of stud height: `dwangRows = max(1, ceil(wallHeightM / 1.35) - 1)` (2.4 m and 2.7 m walls → 1 row, 3.0 m → 2); `nogLengths = ceil((wallLengthM * dwangRows) / timberStockLengthM)`
6. **GIB sheets** — `gibAreaM2 = netWallAreaM2 * gibSides`; `gibSheets = ceil((gibAreaM2 * (1 + wastePercent/100)) / (gibSheetWidthM * gibSheetHeightM))`
7. **GIB screws** — `ceil(gibSheets * 40 * 1.1)` (estimate; round to nearest box in pricing)
8. **GIB adhesive** — `ceil(gibSheets / 4)`
9. **Insulation** — only if `includeInsulation`: `ceil((netWallAreaM2 * (1 + wastePercent/100)) / insulationPackCoverageM2)`
10. **Skirting** — only if `includeSkirting`, every lined face, stopping at door openings: `ceil(((wallLengthM - numberOfDoors * doorWidthM) * gibSides * (1 + wastePercent/100)) / timberStockLengthM)`
11. **Architraves** — only if `includeArchitraves`, on every lined face (an internal door in a wall lined both sides gets architraves both sides): `ceil((numberOfDoors * ((doorHeightM * 2) + doorWidthM) * gibSides * (1 + wastePercent/100)) / timberStockLengthM)`
12. **Framing nails** — fixed 1 box allowance per small wall

Every `ceil` above goes through `safeCeil` (round to 6 dp first) so float
noise never adds a unit: a 3.2 m wall's 9.6 m of plate is exactly 2 × 4.8 m
lengths, and 19 sheets need 836 screws, not 837.

## Units (parser)

`aiTakeoffParser.readDimension` is the one unit rule: an explicit mm / cm / m
(m² / mm²) suffix wins; a bare length / width / height ≥ 100 is millimetres
("2400 high" = 2.4 m); spacings come out in mm ("600 centres" = 600 mm). A
value still outside its band after conversion (wall height 1.8–6 m, length
0.1–200 m, spacing 100–1200 mm, …) is flagged for review and never reaches a
calculator.

## Warnings

Return warnings (do not throw) when:
- `wallLengthM` is missing or `<= 0`
- `wallHeightM` is missing or `<= 0`
- `netWallAreaM2 === 0`
- `gibSides` is not 1 or 2
- `studSpacingMm` is not 400 or 600
- `wastePercent` is below 0

## Integration contract

The quote editor reads form values, calls `calculateMaterialTakeoff`, and converts each output material into a quote line item:

- `priceMatchKey` is the stable identifier — the editor looks up the user's `materials` library by name (token-overlap on `name`) for the corresponding price.
- If a library match is found: `unit_price = library.default_unit_price`, `library_id = library.id`, supplier link surfaces.
- If no match: `unit_price = 0`, `is_missing_price = true`, the editor shows a "missing price" badge.
- `formula` persists on the line item for audit/breakdown display.
- Manual edits are preserved across saves; only the "Recalculate Materials" button replaces the material line items in bulk.

## Things this skill must NOT do

- Invent final quantities
- Hard-code prices (prices live in the user's `materials` library)
- Touch labour / margin / GST / total formulas (those are owned by the quote engine)
- Modify quote_data fields outside `line_items` for materials
