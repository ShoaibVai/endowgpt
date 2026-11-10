# CHANGES — endowGPT modification log

Every upstream (LibreChat / rag-api) file touched by endowGPT, with a one-line
reason. Root-level files (`docker-compose.yml`, `.env.example`, `PLAN.md`,
`README.md`, `scripts/`) are endowGPT-native and listed here once rather than
per-edit.

Updated per milestone. Before each entry lands, the change is checked against
`LibreChat-main/AGENTS.md` rules (logic in `packages/api`, shared types in
`packages/data-provider`, DB contracts in `packages/data-schemas`, theming via
theme tokens, copy via `useLocalize()`).

## Native (endowGPT) files

- `docker-compose.yml` — the full product stack (build both upstream trees).
- `.env.example`, `.env` (local only) — environment template with every variable documented.
- `.gitignore`, `LICENSES.md` — repo hygiene and upstream license notices.
- `PLAN.md`, `README.md`, `REPORT.md` — design of record, ops guide, closing report.
- `scripts/brand-assets.mjs`, `scripts/smoke.mjs` — asset generation; boot/model smoke test.
- `endowgpt-logo*.svg`, `logo-reveal.mp4` — brand source assets (committed; generated
  derivatives are built by `scripts/brand-assets.mjs` and also committed).

## Core edits (LibreChat upstream)

| File | Milestone | Reason |
|---|---|---|
| `librechat.yaml` | M1 | endowGPT endpoint/model specs, theme, welcome/starters, documents config |
| `packages/api/src/prompts/artifacts/index.ts` | M3 | document artifact guidance in the artifact system prompt |
| `packages/api/src/app/interface.ts` | M2 | expose `interface.logoSplash` in the pre-login startup payload |
| `packages/data-provider/src/config.ts` | M2/M4 | `interface.logoSplash` + `documents` configSchema block (levers, defaults) + document types/schemas |
| `packages/data-provider/src/documents.ts` | M2/M4 | shared document API types, zod schemas, data service (new file) |
| `packages/data-provider/src/keys.ts` | M4 | document query/mutation keys |
| `client/src/utils/artifacts.ts` | M3 | register `application/vnd.endowgpt.document` MIME + aliases |
| `client/src/components/Artifacts/ArtifactTabs.tsx` | M3 | dispatch the `document` artifact type to the TipTap editor |
| `client/src/components/Artifacts/Artifacts.tsx` | M3 | version back/forward chrome, download/copy wiring for documents |
| `client/src/components/Chat/Messages/Content/FilePreviewDialog.tsx` | M6 | "Edit this document" import action |
| `client/src/components/Auth/AuthLayout.tsx` | M2 | theme-aware endowGPT login logo (CSS band crop) |
| `client/index.html` | M2 | endowGPT title, description, theme-color |
| `client/src/App.jsx` | M2 | logo splash mount inside the provider tree |
| `client/src/main.jsx` | M2 | import `components/Brand/endow.css` last |
| `client/vite.config.ts` | M2 | PWA manifest name/colors/icons; precache brand+splash assets |
| `client/src/routes/index.tsx` | M2/M5 | `/credits` route now; `/documents` routes in M5 |
| `client/src/locales/en/translation.json` | M2–M6 | endowGPT copy keys |
| `client/package.json` | M2 | TipTap suite, marked, turndown(+gfm), diff, docx, jspdf, @types/turndown |
| `api/server/routes/index.js` | M4 | mount `/api/documents` (thin wiring into TS router) |
| `packages/data-schemas/src/schema/document.ts` | M4 | Mongo schema for documents + version snapshots (new file) |
| `packages/data-schemas/src/schema/index.ts` | M4 | export the new schema |
| `packages/data-schemas/src/models/document.ts` | M4 | model + seeded indexes (new file) |
| `packages/data-schemas/src/models/index.ts` | M4 | export the new model |
| `packages/data-schemas/src/methods/document.ts` | M4 | upsert/list/get/restore/version methods (new file) |
| `packages/data-schemas/src/methods/index.ts` | M4 | export the new methods |

## New feature modules (endowGPT files inside LibreChat-main)

| Path | Milestone | Purpose |
|---|---|---|
| `scripts/brand-assets.mjs` (repo root) | M2 | raster-first asset pipeline: full-canvas SVG renders in Chrome, pixel-space crops/plates/ICO, splash transcodes |
| `api/server/routes/documents.js` | M4 | thin CJS mount of the documents TS router |
| `packages/api/src/documents/index.ts` | M4 | TS entry: router factory + service wiring |
| `packages/api/src/documents/service.ts` | M4 | document CRUD/version restore against data-schemas methods |
| `packages/api/src/documents/aiEdit.ts` | M5 | OpenCode-backed selection-edit call with allow-listed models + safe errors |
| `packages/api/src/documents/routes.ts` | M4 | express router with zod validation and status mapping |
| `client/src/components/Artifacts/Document/index.tsx` | M4 | TipTap editor surface exposed through the artifact panel |
| `client/src/components/Artifacts/Document/editor/` | M4 | toolbar, menus, markdown I/O, exporters |
| `client/src/components/Artifacts/Document/store.ts` | M4 | feature-owned Jotai atoms (content, pending suggestion, versions) |
| `client/src/components/Artifacts/Document/marks.ts` | M5 | `endowInsert`/`endowDelete` TipTap marks for inline diffs |
| `client/src/components/Artifacts/Document/versions.tsx` | M5 | history drawer, preview, restore |
| `client/src/components/Brand/logos.ts` | M2 | single source of logo paths + CSS crop constants |
| `client/src/components/Brand/LogoSplash.tsx` | M2 | once-per-session reveal video with static fallback; skip + reduced-motion |
| `client/src/components/Brand/Credits.tsx` | M2 | `/credits` attribution page |
| `client/src/components/Brand/endow.css` | M2 | splash keyframes only (no brand colors) |

## Brand-asset findings (recorded for future maintainers)

- The supplied filenames are **inverted** relative to their artwork:
  `endowgpt-logo-dark.svg` carries the white wordmark (dark backgrounds),
  `endowgpt-logo-white.svg` the black wordmark (light backgrounds), and
  `endowgpt-logo-2.svg` is an all-gray monochrome tone-on-tone variant.
- All three share one 1500×1500 canvas; the lockup band is x 50–1459, y 607–892
  and the mark is x 50–335. Serving `viewBox`-cropped variants of this artwork
  hits a Chromium viewport bug (lossy top-left strip), so served SVGs keep the
  full square canvas and crops happen in CSS (`object-fit: cover`,
  `object-position: 50.3% 49.97%`, aspect 1410/286) — see
  `client/src/components/Brand/logos.ts`. Raster derivatives (favicons, PWA
  icons, marks) are produced by the pipeline from a full-canvas render.
- The splash reveal video has a white background; the splash overlay uses
  `bg-white` deliberately so the media never shows a seam.

## Core edits (rag-api upstream)

(none yet; M6 planned) — expected: none required, since environment wiring in
`docker-compose.yml` is sufficient.

## Motion log

- **M0** — plan, scaffold, env template, .gitignore. No upstream edits.
- **M1** — compose stack + librechat.yaml model wiring. No upstream edits.
- **M2 (in progress)** — brand pipelines + assets, config levers
  (`interface.logoSplash`, `documents` block), splash component + App mount,
  theme-aware login logo, `/credits` page, PWA manifest + shell branding,
  client dependency additions.
