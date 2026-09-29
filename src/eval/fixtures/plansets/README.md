# Plan-set fixtures (local only)

Real consented plan sets belong to their designers and carry clients' names
and addresses: they are **never committed**. Everything in this folder except
this README and `.gitignore` is ignored by git.

Run the whole reader on local PDFs:

```
PLANSET_E2E="/path/one.pdf;/path/two.pdf" \
PLANSET_EXPECT=src/eval/fixtures/plansets/expectations.local.json \
npx vitest run src/eval/planset/planset-e2e.test.ts --reporter=verbose
```

`expectations.local.json` maps a PDF's file name to hand-checked facts from
that set (only facts printed on the plans — never the reader's own output):

```json
{ "plans.pdf": { "floorAreaM2": 193.3, "windows": ["W01", "W02"], "doors": 22, "lintels": 16, "minProven": 5 } }
```

The AI reading of notes runs only when `ANTHROPIC_API_KEY` is set.
