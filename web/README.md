# BCI · LERB

Building Circularity Index (BCI) and Embodied Carbon (EC) calculator for buildings.
Frontend port of the spreadsheet model in `../0-樣板-RC/`.

## Stack
- Vite + React + TypeScript + Tailwind
- zustand (state), react-router (routing), react-i18next (i18n: zh-TW + en)
- recharts (dashboard charts)

## Scripts
```
npm run dev       # start dev server at http://localhost:5173
npm run build     # type-check and build to dist/
npm run preview   # preview the production build locally
npm run test      # run vitest unit tests for the engine
```

## Layout
- `src/engine/` — pure TS engine. `columns.ts` ports the formulas from
  `1-1_RC結構柱.xlsx`. `aggregate.ts` rolls up element → component → building.
- `src/templates/RC/columns.json` — material database and category defaults
  extracted from the spreadsheet (36 concrete grades × 6 strengths × 6
  admixture levels, 5 rebar cross-section ratios, 6 baseline EC values).
- `src/routes/` — page-level components (project meta, columns input,
  dashboard).
- `src/i18n/` — zh-TW + en dictionaries.

## Validation
The source `.xlsx` files were authored in Google Sheets and use ARRAYFORMULA /
BYROW / LAMBDA wrapped in `__xludf.DUMMYFUNCTION`. These formulas don't evaluate
in any non-Google environment, so opening the workbooks anywhere else (Excel,
LibreOffice, openpyxl) leaves all derived cells as `#N/A`.

Engine validation is therefore done with hand-derived expected values from the
spreadsheet's formula text — see `src/engine/__tests__/columns.test.ts`.

To validate against real numbers later: open the source workbook in Google
Sheets, fill in `數量清單` for known elements, copy the `CI&EC計算` /
`整體結果` outputs into a fixture, and add a regression test.

## Deploy (GitHub Pages)
The `.github/workflows/deploy.yml` at the repo root builds with
`VITE_BASE=/<repo-name>/` and publishes `web/dist/` to GitHub Pages on push to
`main`. To enable: in the GitHub repo settings, set Pages source to
"GitHub Actions".

## Status
**Phase 1 (this commit)**: RC structural columns only — engine, UI, dashboard,
bilingual. Other RC categories (beams, slabs, walls, cladding, windows, interior
walls, floors) and the SRC template will land in subsequent phases.
