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
- `start.bat`, `stop.bat` — one-click Windows start/stop for the stack (`--build` rebuilds, `--wipe` deletes data).
- `.env.example`, `.env` (local only) — environment template with every variable documented.
- `.gitignore`, `LICENSES.md` — repo hygiene and upstream license notices.
- `PLAN.md`, `README.md`, `REPORT.md` — design of record, ops guide, closing report.
- `scripts/brand-assets.mjs`, `scripts/smoke.mjs`, `scripts/smoke-files.mjs` — asset generation; boot/model smoke; authenticated native-file smoke.
- `endowgpt-logo*.svg`, `logo-reveal.mp4` — brand source assets (committed; generated
  derivatives are built by `scripts/brand-assets.mjs` and also committed).

## Documents-only simplification (M9, intentional divergence)

endowGPT deliberately diverges from upstream LibreChat's code/HTML/React/SVG/Mermaid
artifact system. This is not an upstream bug fix: the stock artifact capability is
removed so non-technical users get real files and an editable document, not a browser
sandbox.

| Area                    | Change                                                                                                                                                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stock artifact prompt   | Removed `packages/api/src/prompts/artifacts/*`; `generateArtifactsPrompt` is no longer imported or exported. `packages/api/src/agents/initialize.ts` now appends `documentsPrompt` and `filesPrompt` on every run.                                                                                                                            |
| Native files            | `create_spreadsheet`, `create_document`, and `create_presentation` stay available on every ephemeral chat (`packages/api/src/agents/load.ts`); their descriptions now forbid HTML/download pages and state one call per file. `filesPrompt` tells the model to call them for .docx/.xlsx/.csv/.md/.pptx and to reply with one short sentence. |
| Artifact capability     | `artifacts` was removed from the active model specs, `defaultAgentCapabilities`, and the ephemeral-agent loader. Legacy client `ephemeralAgent.artifacts` values are ignored. The document editor does not depend on the flag.                                                                                                                |
| Client artifact surface | `client/src/utils/artifacts.ts`, `Artifacts.tsx`, `ArtifactTabs.tsx`, `Artifact.tsx`, and `ArtifactRow.tsx` now cover only `application/vnd.endowgpt.document` and generated files. Legacy `:::artifact` blocks for HTML/React/SVG/Mermaid/code are unwrapped and render as ordinary Markdown.                                                |
| Removed panel modes     | Sandpack preview, Monaco source editor, undocking, refresh scrim, code/preview tabs, and artifact trigger rows. `@codesandbox/sandpack-react`, `@monaco-editor/react`, and `monaco-editor` were removed from `client/package.json`; Vite chunk rules and the root override were removed.                                                      |
| Config                  | Removed `artifactUndocking`, `bundlerURL`, and `staticBundlerURL` from config schemas, startup payloads, shared-link config, and `librechat.example.yaml`.                                                                                                                                                                                    |
| Chat UX                 | Centered 700–760px reading column, assistant author headers suppressed, developer header controls (model selector, presets, bookmarks, compare, trace, temporary chat) hidden, composer reduced to attach/mic/send, sidebar reduced to history plus the superadmin entry, developer settings tabs hidden.                                     |
| Legacy data             | Old HTML/React/code artifact conversations keep readable fenced content; they do not crash or reopen a panel.                                                                                                                                                                                                                                 |
| Spreadsheet preview     | The viewer reads its CSS modules by their real `spreadsheet-*` keys; workbook-driven column widths now render as side-by-side columns instead of a single stacked column.                                                                                                                                                                     |
| File preview scrolling  | Spreadsheet, DOCX, Markdown, PDF, and legacy text previews share a `preview-scroll` container with a full-size 8px horizontal/vertical thumb and track, so wide sheets and long documents have an obvious scrollbar.                                                                                                                          |

## Core edits (LibreChat upstream)

| File                                                                | Milestone | Reason                                                                                                              |
| ------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------- |
| `librechat.yaml`                                                    | M1        | endowGPT endpoint/model specs, theme, welcome/starters, documents config                                            |
| `packages/api/src/prompts/artifacts/index.ts`                       | M3 → M9   | document artifact guidance in the stock prompt; removed in M9 and replaced by `prompts/documents` + `prompts/files` |
| `packages/api/src/app/interface.ts`                                 | M2        | expose `interface.logoSplash` in the pre-login startup payload                                                      |
| `packages/data-provider/src/config.ts`                              | M2/M4     | `interface.logoSplash` + `documents` configSchema block (levers, defaults) + document types/schemas                 |
| `packages/data-provider/src/documents.ts`                           | M2/M4     | shared document API types, zod schemas, data service (new file)                                                     |
| `packages/data-provider/src/keys.ts`                                | M4        | document query/mutation keys                                                                                        |
| `client/src/utils/artifacts.ts`                                     | M3        | register `application/vnd.endowgpt.document` MIME + aliases + row kind                                              |
| `client/src/components/Artifacts/ArtifactTabs.tsx`                  | M3        | dispatch the `document` artifact type to the TipTap editor                                                          |
| `client/src/components/Artifacts/Artifacts.tsx`                     | M5        | version back/forward chrome, download/copy wiring for documents                                                     |
| `client/src/components/Chat/Messages/Content/FilePreviewDialog.tsx` | M6        | "Edit this document" import action                                                                                  |
| `client/src/components/Auth/AuthLayout.tsx`                         | M2        | theme-aware endowGPT login logo (CSS band crop)                                                                     |
| `client/index.html`                                                 | M2        | endowGPT title, description, theme-color                                                                            |
| `client/src/App.jsx`                                                | M2        | logo splash mount inside the provider tree                                                                          |
| `client/src/main.jsx`                                               | M2        | import `components/Brand/endow.css` last                                                                            |
| `client/vite.config.ts`                                             | M2        | PWA manifest name/colors/icons; precache brand+splash assets                                                        |
| `client/src/routes/index.tsx`                                       | M2/M5     | `/credits` route now; `/documents` routes in M5                                                                     |
| `client/src/locales/en/translation.json`                            | M2–M6     | endowGPT copy keys                                                                                                  |
| `client/package.json`                                               | M2        | TipTap suite, marked, turndown(+gfm), diff, docx, jspdf, @types/turndown                                            |
| `api/server/index.js`                                               | M4        | mount `/api/documents`                                                                                              |
| `api/server/routes/index.js`                                        | M4        | register the documents router                                                                                       |
| `api/server/routes/config.js`                                       | M4        | expose `documents` limits in the startup payload                                                                    |
| `packages/data-provider/src/api-endpoints.ts`                       | M4        | `/api/documents` endpoint builders                                                                                  |
| `packages/data-provider/src/index.ts`                               | M4        | export the documents module                                                                                         |
| `packages/api/src/index.ts`                                         | M4        | export the documents TS module                                                                                      |
| `packages/data-schemas/src/types/app.ts`                            | M4        | `AppConfig.documents` (AppService-resolved limits)                                                                  |
| `packages/data-schemas/src/app/service.ts`                          | M4        | parse `documents` from librechat.yaml into AppConfig                                                                |
| `packages/data-schemas/src/types/document.ts`                       | M4        | document types/params/results (new file)                                                                            |
| `packages/data-schemas/src/schema/index.ts`                         | M4        | export the new schema                                                                                               |
| `packages/data-schemas/src/models/index.ts`                         | M4        | register the model in `createModels`                                                                                |
| `packages/data-schemas/src/methods/index.ts`                        | M4        | fold document methods into `createMethods`                                                                          |
| `api/server/index.js`                                               | M8        | mount `/api/superadmin`                                                                                             |
| `api/server/routes/index.js`                                        | M8        | register the superadmin router                                                                                      |
| `packages/data-provider/src/api-endpoints.ts`                       | M8        | `/api/superadmin` endpoint builders                                                                                 |
| `packages/data-provider/src/data-service.ts`                        | M8        | re-export the superadmin read service                                                                               |
| `packages/data-provider/src/keys.ts`                                | M8        | superadmin query keys                                                                                               |
| `packages/data-provider/src/index.ts`                               | M8        | export the superadmin module                                                                                        |
| `packages/data-schemas/src/methods/index.ts`                        | M8        | fold superadmin aggregation methods into `createMethods`                                                            |
| `packages/data-schemas/src/types/index.ts`                          | M8        | export superadmin method types                                                                                      |
| `packages/api/src/index.ts`                                         | M8        | export the superadmin TS module                                                                                     |

## New feature modules (endowGPT files inside LibreChat-main)

| Path                                                                 | Milestone | Purpose                                                                                                                       |
| -------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `scripts/brand-assets.mjs` (repo root)                               | M2        | raster-first asset pipeline: full-canvas SVG renders in Chrome, pixel-space crops/plates/ICO, splash transcodes               |
| `api/server/routes/documents.js`                                     | M4        | thin CJS mount: requires `@librechat/api` router, `~/models` methods, config middleware                                       |
| `packages/api/src/documents/index.ts`                                | M4        | TS entry: router factory + provider call                                                                                      |
| `packages/api/src/documents/routes.ts`                               | M4/M5     | express router: zod validation, per-request limits, per-user hourly ai-edit limiter, status mapping (409 conflict, coded 5xx) |
| `packages/api/src/documents/aiEdit.ts`                               | M5        | OpenCode-backed selection-edit call; allow-list + safe error codes                                                            |
| `packages/data-schemas/src/schema/document.ts`                       | M4        | Mongo schema (document + version snapshots + tenant isolation)                                                                |
| `packages/data-schemas/src/types/document.ts`                        | M4        | document types/params/results                                                                                                 |
| `packages/data-schemas/src/models/document.ts`                       | M4        | model factory with tenant isolation                                                                                           |
| `packages/data-schemas/src/methods/document.ts`                      | M4        | upsert/list/get/version/restore/delete methods                                                                                |
| `packages/data-provider/src/documents.ts`                            | M4        | shared request/response schemas + REST service                                                                                |
| `client/src/components/Artifacts/Document/index.tsx`                 | M4        | TipTap editor surface exposed through the artifact panel                                                                      |
| `client/src/components/Artifacts/Document/markdown.ts`               | M4        | marked ↔ turndown Markdown bridge                                                                                            |
| `client/src/components/Artifacts/Document/exporters.ts`              | M4        | DOCX/PDF/rich-copy exports (client-side)                                                                                      |
| `client/src/components/Artifacts/Document/tiptapMarks.ts`            | M5        | `endowInsert`/`endowDelete` TipTap marks for inline diffs                                                                     |
| `client/src/components/Artifacts/Document/aiSelection.tsx`           | M5        | floating selection toolbar: rewrite/expand/shorten/grammar/translate, tone submenu, inline Ask AI instruction                 |
| `client/src/components/Artifacts/Document/diff.ts`                   | M5        | word-level diff + meaningful-change guard (unit-tested)                                                                       |
| `client/src/components/Artifacts/Document/suggestionActions.ts`      | M5        | accept/reject rebuild of the marked range in one transaction                                                                  |
| `client/src/components/Artifacts/Document/DocumentPage.tsx`          | M5        | `/documents/:conversationId/:artifactId` full-page editor                                                                     |
| `client/src/components/Artifacts/Document/DocumentsList.tsx`         | M5        | `/documents` index of store-backed documents                                                                                  |
| `client/src/components/Artifacts/Document/store.ts`                  | M5        | feature-owned Jotai atoms (pending suggestion, versions)                                                                      |
| `client/src/components/Artifacts/Document/document.css`              | M4        | editor-local markdown metrics + suggestion mark styling                                                                       |
| `client/src/components/Artifacts/Document/versions.tsx`              | M5        | history drawer, preview, restore                                                                                              |
| `client/src/data-provider/Documents/`                                | M4        | React Query hooks (queries + mutations)                                                                                       |
| `client/src/components/Brand/logos.ts`                               | M2        | single source of logo paths + CSS crop constants                                                                              |
| `client/src/components/Brand/LogoSplash.tsx`                         | M2        | once-per-session reveal video with static fallback; skip + reduced-motion                                                     |
| `client/src/components/Brand/Credits.tsx`                            | M2        | `/credits` attribution page                                                                                                   |
| `client/src/components/Brand/endow.css`                              | M2        | splash keyframes only (no brand colors)                                                                                       |
| `api/server/routes/superadmin.js`                                    | M8        | thin CJS mount: JWT + `access:admin`, then the TS router                                                                      |
| `packages/data-provider/src/superadmin.ts`                           | M8        | shared superadmin wire types, query schemas, and read service                                                                 |
| `packages/data-schemas/src/types/superadmin.ts`                      | M8        | superadmin method input/result types                                                                                          |
| `packages/data-schemas/src/methods/superadmin.ts`                    | M8        | overview, per-user usage, conversation list, and transcript aggregations                                                      |
| `packages/data-schemas/src/methods/superadmin.spec.ts`               | M8        | aggregation tests (transactions, message fallback, search, ownership)                                                         |
| `packages/api/src/superadmin/routes.ts`                              | M8        | validated read-only router + stable error codes                                                                               |
| `packages/api/src/superadmin/routes.spec.ts`                         | M8        | HTTP contract tests for the portal                                                                                            |
| `packages/api/src/superadmin/index.ts`                               | M8        | module export                                                                                                                 |
| `client/src/data-provider/SuperAdmin/queries.ts`                     | M8        | React Query hooks for access, overview, users, chats, messages                                                                |
| `client/src/data-provider/SuperAdmin/index.ts`                       | M8        | data-provider barrel                                                                                                          |
| `client/src/components/SuperAdmin/SuperAdminView.tsx`                | M8        | `/superadmin` page: range KPIs, daily/model usage, user table                                                                 |
| `client/src/components/SuperAdmin/panels.tsx`                        | M8        | panels, KPI cards, usage tables, user table, pagination                                                                       |
| `client/src/components/SuperAdmin/ChatHistory.tsx`                   | M8        | read-only conversation picker and message transcript dialog                                                                   |
| `client/src/components/SuperAdmin/format.ts`                         | M8        | locale-aware number/date formatting                                                                                           |
| `client/src/components/SuperAdmin/index.ts`                          | M8        | lazy route entry                                                                                                              |
| `client/src/components/SuperAdmin/__tests__/SuperAdminView.spec.tsx` | M8        | access, totals, and transcript component tests                                                                                |
| `client/src/routes/index.tsx`                                        | M8        | `/superadmin` route                                                                                                           |
| `client/src/hooks/Nav/useUnifiedSidebarLinks.ts`                     | M8        | sidebar entry gated by `access:admin`                                                                                         |
| `client/src/locales/en/translation.json`                             | M8        | superadmin copy keys                                                                                                          |
| `packages/api/src/prompts/files/index.ts`                            | M9        | firm file-request guidance: native tools, no HTML/download page, one call per file                                            |
| `scripts/smoke-files.mjs` (repo root)                                | M9        | authenticated smoke for the md+docx+xlsx prompt and Excel/PPTX/Word variants                                                  |

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

(none) — M6 verification found no rag-api changes necessary: the stack runs on
environment wiring in `docker-compose.yml` (`EMBEDDINGS_PROVIDER=ollama`,
`OLLAMA_BASE_URL`, pgvector connection) and the stock retrieval endpoints;
LibreChat reaches it through `RAG_API_URL` plus the `fileSearch` capability.

## Motion log

- **M0** — plan, scaffold, env template, .gitignore. No upstream edits.
- **M1** — compose stack + librechat.yaml model wiring. No upstream edits.
- **M2** — brand pipelines + assets, config levers (`interface.logoSplash`,
  `documents` block), splash component + App mount, theme-aware login logo,
  `/credits` page, PWA manifest + shell branding, client dependency additions.
- **M3+M4** — `application/vnd.endowgpt.document` end to end: client MIME +
  dispatch + TipTap editor (markdown bridge, serialized autosave, toolbar),
  shared data-provider surface, Mongo storage with version snapshots and
  restore, `packages/api` documents router + aiEdit provider call, prompt
  guidance, React Query hooks, markdown round-trip tests, smoke script.
- **M5** — selection edits and history: floating TipTap BubbleMenu with
  Rewrite/Expand/Shorten/Fix grammar/Translate, a Professional/Casual/
  Persuasive tone submenu, and an inline "Ask AI…" instruction; suggestions
  apply as `endowInsert`/`endowDelete` diffs with accept/reject; async results
  only apply when the captured selection is unchanged. Adds per-user hourly
  rate limiting (`documents.aiEditMaxPerHour`) and the selection cap from
  `documents.aiEditMaxChars`, config-driven autosave, store-seeded conflict
  tokens, and restore that advances the version token and refreshes the chat
  artifact. `/documents` index + full-page editor routes.
- **M6** — RAG and import: stack verified live (Mongo/Meili/pgvector/Ollama/
  RAG/API all healthy; `ollama-init` gates `rag_api` on the pulled embedding
  model), authenticated probes verified upsert/conflict/restore/ai-edit
  mapping, boot smoke green with model calls skipping on the key's free-tier
  quota, file search through the `fileSearch` capability with the upstream
  citations UI, and an "Edit this document" action on `FilePreviewDialog` that
  imports extracted file text into a store-backed document. No rag-api core
  edits were needed.
- **M7** — tests, docs, report: storage contract tests (`document.spec.ts`,
  10 cases with `mongodb-memory-server`: snapshots, conflict, cap pruning,
  restore appends, tenant scoping), HTTP contract tests for the documents
  router (`routes.spec.ts`) and the provider call (`aiEdit.spec.ts`, 28 cases:
  auth, validation, 409 mapping, allow-list, caps, 429 budget, coded provider
  failures), and component tests for suggestion accept/reject (4 cases on a
  real TipTap editor). Two latent bugs found and fixed while writing those
  tests: both suggestion marks registered a command named `setEndowSuggestion`
  (the delete registration won and always applied `endowDelete` — the dead,
  unused command surface was removed), and accept/reject stripped formatting
  that rode along with suggestion spans (now only the suggestion marks are
  stripped). Final report in `REPORT.md`; branding sweep and README ops guide
  finished.
- **M9.2** — file-preview scrolling: the app-wide horizontal scrollbar is a
  near-invisible `0.1em`; generated-file viewers now use a shared
  `preview-scroll` class with an 8px thumb/track, including the spreadsheet's
  horizontal axis. Applies to XLSX/CSV, DOCX, Markdown, PDF, and legacy text
  previews.
- **M9.1** — spreadsheet preview fix: `SpreadsheetViewer` destructured
  `styles.width/grid/canvas/row/cell`, but the CSS module exports
  `spreadsheet-width/grid/canvas/row/cell`, so the grid template and cell styles
  were undefined and every column stacked into one. The component now reads the
  real keys, and the test asserts the grid/row/cell classes reach the DOM.
- **M9** — documents-only simplification: removed the stock artifact prompt,
  client types, panel modes, Sandpack/Monaco dependencies, undocking, and
  developer shell controls; kept the TipTap document editor, versions/restore,
  DOCX/PDF export, `/documents`, and native file cards. Added `filesPrompt` and
  blunt native-file tool descriptions so file requests call
  `create_spreadsheet`/`create_document`/`create_presentation` in normal chat,
  never an HTML artifact. This is an intentional divergence from upstream.
- **M8** - superadmin portal: a read-only `/superadmin` surface for users with
  the `access:admin` capability. Adds `/api/superadmin` (overview, users,
  conversations, transcript, access) with shared wire types in
  `packages/data-provider`, aggregation methods in `packages/data-schemas`, and
  a validation-only router in `packages/api`. Token totals come from the
  per-request `transactions` records and fall back to saved message
  `tokenCount` when a range has no request-level usage. Chat history excludes
  temporary chats and subagent threads and never reads `privateText`. The
  client page reuses semantic theme roles and `@librechat/client` primitives,
  with a sidebar entry shown only after the access probe succeeds. Tests cover
  transaction vs. fallback aggregation, search, pagination, ownership checks,
  the HTTP contract, and the page's access/totals/transcript states.
