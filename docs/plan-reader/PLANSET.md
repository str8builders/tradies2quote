# Whole plan-set reader

Upload the whole consented PDF (drawings, engineer's sheets, consent papers);
get the building, what goes where, the materials, and the things to check.
Owner-only (`planReaderAllowed`) until the real-plan evals pass.

## Rules (inherited from the per-sheet reader, still binding)

- **Never invent a number.** Every fact carries evidence (sheet + text runs or
  a box). AI answers are dropped unless the sheet's own text contains them
  (`interpret/verify.ts`).
- **The scale is proven, never trusted.** A sheet is measured only at a scale
  its own dimension labels prove against their drawn lines
  (`measure/dimensions.ts`), or that a matching sibling sheet proves
  (`measure/align.ts`). Printed scale notes that disagree are reported.
- **Code does the maths.** The AI reads notes, sections and consent papers;
  quantities come from `materialCalculator` and area formulas
  (`takeoff/fromModel.ts`), only from a model the tradie has checked.
- **Every flag is double-checked** before it's shown (e.g. an opening missing
  from the plans is searched for loosely first).
- **Prices only from the tradie's library** on an exact, unit-compatible match;
  everything else waits for a price.

## Pipeline

| Step | Where | What |
|---|---|---|
| Upload | `POST /api/plansets` → signed upload → `POST /api/plansets/{id}/start` | PDF ≤ 50 MB into `plan-uploads/{uid}/sets/{id}/original.pdf` |
| Read | `job.ts` (lease, heartbeat, resume) → `pdf/read.ts` (worker thread) | text runs, stroked lines, filled shapes per page |
| Sheet facts | `sheetFacts.ts` | title block, kind, dimensions + scale proof, walls, marks, schedules, drawing list |
| Set | `finish.ts` | register, borrowed scales, model (`model/assemble.ts`), AI reading (`interpret/*`) |
| Review | `/app/drawings/{id}` | summary, plan with walls/openings drawn on it, questions + RFIs, materials |
| Answers | `POST /api/plansets/{id}/answers` → `model/answers.ts` | corrections become status "tradie" |
| Quote | `POST /api/plansets/{id}/quote` → `takeoff/toQuote.ts` | a draft quote of calculator lines |

Tables: `plan_sets` (status, register, model, answers), `plan_set_sheets`
(per-page facts). Migrations `20260930_plan_sets*.sql`.

## Tested on

The owner's four real NZ sets (local only, never committed): a new house
(ArchiCAD, A3), a marae's engineer's drawings (A1, three buildings, staged), a
renovation (rotated A3 pages, approximate dimensions) and an addition (A1,
pasted NZS 3604 tables, DRAFT marks). On the new house the walls enclose
193.2 m² against 193.3 m² printed, and every overall dimension checks out.
Run: `src/eval/planset/planset-e2e.test.ts` (see its header and
`src/eval/fixtures/plansets/README.md`).
