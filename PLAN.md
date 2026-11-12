# endowGPT — Build Plan

A branded, self-hosted ChatGPT-style workspace built on LibreChat (v0.8.9-rc1) with a
RAG API. The product adds first-class **Artifacts** (including a live document type) and a
**Canvas-style document editor** with AI-assisted targeted edits, diff review, and version
history.

This document is the design of record. `CHANGES.md` tracks every upstream file touched,
`README.md` covers running the stack, and `REPORT.md` closes out the work.

---

## 1. Goals and non-goals

### Goals

| # | Goal |
|---|------|
| G1 | `docker compose up -d` from the repo root brings up the whole product. |
| G2 | Two custom OpenAI-compatible models, branded, streaming, with reasoning display and clear errors. |
| G3 | Full endowGPT branding: no LibreChat user-visible strings, icons, titles, or metadata. Upstream license notices preserved. |
| G4 | Animated logo splash on first load per session, accessible and skippable. |
| G5 | Artifacts side panel with Preview/Code, copy, download, fullscreen, sandboxing, and version back/forward; enabled for both models. |
| G6 | TipTap document editor inside Artifacts: rich formatting, Markdown import/export, AI selection edits, inline diff accept/reject, version history, autosave, rename, export to MD/DOCX/PDF, copy rich text, DB persistence, reopen from chat. |
| G7 | RAG over PDF/DOCX/TXT/MD with citations and "edit this document". |
| G8 | Email/password auth, env-controlled registration, first user is admin, no secrets in git. |
| G9 | Upstream-merge friendliness: new code in named modules, minimal core edits, all core edits listed. |
| G10 | Tests for document diff/edit/version restore plus a boot + two-model smoke test. |

### Non-goals

- Multi-tenant organizations, billing, or quota management.
- Replacing LibreChat's conversation, agent, or preset systems.
- Real-time collaborative editing (single-author documents, last-write-wins with versions).
- Training or hosting models; inference stays with the configured upstream API.

---

## 2. Repository layout

```
endowGPT/
├─ docker-compose.yml          # root stack (the only entry point users need)
├─ .env.example                # every variable documented, no secrets
├─ .env                        # local, gitignored
├─ .gitignore
├─ PLAN.md  CHANGES.md  README.md  REPORT.md
├─ scripts/
│  ├─ brand-assets.mjs         # crop SVGs, rasterize favicons/PWA icons
│  └─ smoke.mjs                # boot + both-model smoke test
├─ LibreChat-main/             # upstream, modified in place
│  ├─ librechat.yaml           # new: endpoint, model specs, theme, starters
│  └─ client/src/...           # branding, splash, artifacts, document editor
└─ rag-api-main/               # upstream RAG API, minimal edits
```

### Working rules (aligned with `LibreChat-main/AGENTS.md`)

- Backend behavior is TypeScript in `packages/api` (e.g. `packages/api/src/documents/`).
  `/api/server/routes/documents.js` stays thin CJS: requires, mounting, and one call into
  the TS module (like `MCPRequestContext.js`).
- Database contracts live in `packages/data-schemas` (`schema/`, `models/`, `methods/`);
  Mongoose types stay out of exported signatures in `packages/api` and the client.
- Shared endpoint definitions, types, data services and query keys live in
  `packages/data-provider` (`src/documents.ts`, registrations in `src/keys.ts`).
- New levers (limits, toggles) are added to `configSchema` in
  `packages/data-provider/src/config.ts` with librechat.yaml defaults, not left as
  hard-coded constants or env-only switches.
- New client state is Jotai (never new Recoil); feature-owned state stays in the feature.
- Visible copy goes through `useLocalize()`; new keys are added to
  `client/src/locales/en/translation.json` (English only).
- Action menus use `DropdownPopup` from `@librechat/client` with `Ariakit.MenuButton`.
- Styling uses semantic theme/Tailwind roles from `@librechat/client`; brand colors come
  from the deployment theme in `librechat.yaml`, not a custom palette CSS file. Only
  genuinely local CSS (splash animation) is feature-local.
- API interactions use React Query; mutations invalidate related queries.
- Every core edit is recorded in `CHANGES.md` with file path and one-line reason.
- Root files are ours; we do not edit LibreChat's own `docker-compose.yml`,
  `docker-compose.override.yml.example`, or `Dockerfile` unless unavoidable.

---

## 3. Runtime architecture

```
                       ┌─────────────────────────────┐
  browser ──HTTPS─────▶│  api (LibreChat, :3080)     │
   (React SPA)         │  Express + React build      │
                       └──────┬───────────┬──────────┘
                              │           │
                   ┌──────────▼──┐   ┌────▼─────────────┐
                   │  mongodb    │   │  meilisearch     │
                   │  app data   │   │  conversation    │
                   │  documents  │   │  search          │
                   └─────────────┘   └──────────────────┘
                              │
                   ┌──────────▼──────────┐      ┌────────────────────┐
                   │  rag_api (:8000)    │─────▶│  vectordb (pgvector)│
                   │  FastAPI + LlamaIdx │      │  Postgres 16        │
                   └──────────┬──────────┘      └────────────────────┘
                              │ embeddings
                   ┌──────────▼──────────┐
                   │  ollama (:11434)    │
                   │  nomic-embed-text   │
                   └─────────────────────┘

  api ──HTTPS──▶ https://opencode.ai/zen/v1  (chat + title generation)
```

Services in root `docker-compose.yml`:

| Service | Image / build | Purpose |
|---|---|---|
| `api` | build `./LibreChat-main` | LibreChat server + built SPA |
| `mongodb` | `mongo:7` | users, conversations, messages, documents |
| `meilisearch` | `getmeili/meilisearch:v1.12` | conversation search |
| `rag_api` | build `./rag-api-main` | file ingestion + retrieval |
| `vectordb` | `pgvector/pgvector:pg16` | embeddings store |
| `ollama` | `ollama/ollama:latest` | local embeddings |
| `ollama-init` | `ollama/ollama:latest` | one-shot `pull nomic-embed-text` |

All state is in named volumes. Only `api` publishes a host port. `rag_api` and
`vectordb` stay on the internal network. A single `.env` at the root feeds compose and is
mounted into the API container as LibreChat's `.env`.

Health checks: `mongodb` (`mongosh ping`), `meilisearch` (`/health`), `vectordb`
(`pg_isready`), `ollama` (`/api/tags`), `rag_api` (`/health`); `api` depends on the first
four being healthy. `ollama-init` gates `rag_api` so embeddings never fail on first boot.

---

## 4. Models and inference

Single custom endpoint, OpenAI-compatible:

```yaml
endpoints:
  custom:
    - name: "endowGPT"
      apiKey: "${OPENCODE_API_KEY}"
      baseURL: "https://opencode.ai/zen/v1"
      models:
        default: ["deepseek-v4.1-flash"]
        fetch: false
      titleConvo: true
      titleMethod: "completion"
      titleModel: "deepseek-v4.1-flash"
      modelDisplayLabel: "endowGPT"
```

Per-model specs provide the labels the endpoint cannot:

| Spec `name` | `label` (UI) | Capabilities |
|---|---|---|
| `deepseek-v4.1-flash` | endowGPT Fast | `default: true`, `artifacts: true`, `fileSearch: true`, `showOnLanding: true`, reasoning |

- API key comes only from `OPENCODE_API_KEY`; it is never written into YAML or code.
- `titleModel` uses the same model, so titles never need a second upstream model.
- `fileSearch: true` makes LibreChat create an ephemeral agent per conversation for custom
  endpoints, which is what enables RAG tools *and* artifact prompting.
- Streaming stays on (`streaming: true` in `librechat.yaml`).
- Reasoning text is rendered in a collapsible "Thinking" block (existing LibreChat
  reasoning UI, restyled and labelled).
- Rate limit / quota / auth failures from the upstream are mapped to human-readable
  messages: 401 → "endowGPT could not authenticate with the model provider…",
  429 → "The model is rate-limited right now. Try again in a few seconds.", 5xx →
  "The model provider is having trouble…". No raw stack traces or keys in the UI.
- Default new-chat model: DeepSeek (spec `default: true`).

**Decision (documents):** document creation and update use LibreChat's
existing *artifact-in-markdown* contract, not tool calls. The model is instructed to emit a
```document ... ``` block with `type: "document"`; updates re-emit the same artifact with an
`identifier` and the full new Markdown. This is the most reliable path for
DeepSeek because it needs no tool-calling support, and LibreChat already reconciles
artifacts by identifier. Two safety nets make it robust:

1. The client editor owns the canonical content once opened, autosaves to
   `/api/documents`, and can always update the message artifact from the editor.
2. Targeted selection edits never depend on the model obeying an artifact contract — they
   call `POST /api/documents/ai-edit` with the exact selected text and get plain text back.

The model is tested with the same prompts; see §10.

---

## 5. Branding

### Palette (from the logo SVGs)

| Token | Hex | Use |
|---|---|---|
| indigo | `#534cd6` | primary accent, buttons, links |
| teal | `#24d5d0` | secondary accent, focus rings, gradients |
| blue | `#6fbde0` | info, charts, subtle highlights |
| olive | `#9eab67` | tertiary accent |
| yellow | `#e1e366` | highlight / warning-adjacent accent |
| off-white | `#f9f3f4` | light app background |
| gray | `#b4b4b4` | muted text, dividers |
| logo red | `#f1352a` | mark accent only (not a UI accent) |

Applied through the LibreChat deployment theme in `librechat.yaml` (`interface.theme`
inline definition, plus `interface.customWelcome`, `interface.customFooter`,
`APP_TITLE`). All new UI uses the shared semantic theme/Tailwind roles from
`@librechat/client`; brand colors reach components only through theme tokens, never as
raw palette classes. A tiny `client/src/style/endow.css` covers only genuinely local
needs (splash animation keyframes); it is imported last and contains no brand color
values that belong in the theme definition.

`interface.logoSplash` is a new config lever for the splash toggle (settable in
`librechat.yaml`, default `true`), not an env-only switch.

### Asset mapping (supplied files are named inversely to their artwork)

| Source pack file | Actual artwork | Deployed as |
|---|---|---|
| `endowgpt-logo-white.svg` | dark `#111e1e` wordmark + red mark | `assets/endowgpt-logo-onlight.svg` (light theme) |
| `endowgpt-logo-dark.svg` | white wordmark + red mark | `assets/endowgpt-logo-ondark.svg` (dark theme) |
| `endowgpt-logo-2.svg` | gray monochrome tone-on-tone lockup | `assets/endowgpt-logo-mono.svg` (accents on dark) |

All three keep the source's 1500×1500 square canvas — viewBox-cropped variants
of this artwork hit a Chromium viewport bug, so in-app crops are CSS
(`object-fit: cover`) driven by constants in `client/src/components/Brand/logos.ts`.
Raster derivatives are generated by `scripts/brand-assets.mjs`:

- `favicon.ico` (transparent red mark @16/32), `favicon-16x16.png`,
  `favicon-32x32.png`, `apple-touch-icon-180x180.png`
- `icon-192x192.png`, `icon-512x512.png`, `maskable-icon.png` (indigo `#534cd6`
  plate + red mark; maskable keeps the 80% safe zone)
- `endowgpt-mark.png` + `endowgpt-mark@2x.png` + `endowgpt-mark-mono.png`
  (UI marks; PNGs, since cropped SVG variants of this artwork render unreliably)
- `logo-reveal.mp4` (H.264 ≤720px, muted) + `logo-reveal.webm` (VP9) splash media

- `logo-reveal.mp4` (H.264 ≤720px, muted) + `logo-reveal.webm` (VP9) splash media

### Branding touchpoints

| Surface | Change |
|---|---|
| Browser title | `APP_TITLE=endowGPT`; `index.html` `<title>` |
| Favicon / PWA | new icons in `client/public/assets`, manifest in `client/vite.config.ts` |
| Login | `AuthLayout` uses theme-aware endowGPT logo (`<picture>` / CSS) |
| Sidebar / header | logo swap, no LibreChat wordmark |
| Welcome | "What can I help you build today?" + endowGPT subtitle |
| Starters | "Draft a document", "Build an interactive page", "Summarize a file" |
| Footer | `customFooter` with © endowGPT + link to `/credits` |
| About / licenses | new `/credits` route: endowGPT © notice, LibreChat MIT license text, RAG API license, third-party notices |
| Metadata | remove upstream `LibreChat` strings from `index.html`, manifest, `package.json` description (not package name), and any user-visible copy found by `grep` |

`grep -ri librechat client/src --include=*.tsx --include=*.ts` is run before sign-off;
remaining hits are allowed only in import paths, comments, license text, or `/credits`.

### Splash

`<LogoSplash>` mounts once per browser session (`sessionStorage["endowgpt-splash"]`), plays
`logo-reveal.mp4` muted / autoplay / playsinline / `preload="auto"` over an off-white
`#f9f3f4` backdrop (the video has a white background, so it stays light in dark mode too),
with the light logo SVG as the static poster and fallback. It fades out on `ended`, on
click, on `Esc`, or after 2.5 s max; a "Skip" button is always present. If
`prefers-reduced-motion: reduce`, it renders the static logo for 400 ms or not at all. The
video is re-encoded to ≤720×720 H.264 (`-an -crf 26`) plus VP9 WebM; the original ~330 KB
file is already small, so both formats are shipped and the MP4 is the fallback.

---

## 6. Artifacts

LibreChat already ships the artifact panel. Work is polish + a new `document` kind.

- New artifact type `application/vnd.endowgpt.document`, aliases `document`, `doc`.
- `ArtifactTabs` dispatches this MIME to the new `DocumentArtifact` editor instead of
  `Markdown`.
- Panel keeps Preview/Code tabs, copy, download, fullscreen, sandboxed iframe for HTML,
  and adds version back/forward:
  - Artifact content history is captured client-side per artifact identifier on each save
    (`useArtifactHistory`), with a cap of 50 entries.
  - Back/forward restore the artifact and push a new save through the existing
    `POST /api/messages/artifact/:messageId` path, so the message stays the source of truth.
- Download filenames come from artifact `title` + extension map; `document` → `.md`.
- Sandbox: HTML previews keep `sandbox="allow-scripts"` without `allow-same-origin`;
  external links open with `rel="noopener noreferrer"`.
- Artifact prompts enabled on both model specs (`artifacts: true`).
- Follow-up edits: a follow-up instruction that references an existing artifact causes the
  model to re-emit it by `identifier`; LibreChat's reconciliation updates the existing
  panel rather than creating a second artifact. When the document editor is open, editor
  saves also update the message artifact so chat and editor never diverge.

---

## 7. Document editor

### 7.1 UX

Route `/documents/:conversationId/:artifactId` (and `/documents` for a list of documents
imported from files). Opening an artifact of type `document` from chat also opens this
editor in the artifact panel; the full-screen route is for focused work.

Editor: TipTap v2 with StarterKit, Link, Underline, Placeholder, Table/TableRow/
TableHeader/TableCell. Toolbar: headings, bold, italic, underline, strike, bullet/ordered
lists, blockquote, code block, table, link, undo/redo. Status bar: "Saved · 12:04",
word count.

Selection toolbar (floating, appears on non-empty selection): **Improve**, **Shorten**,
**Expand**, **Fix grammar**, **Translate**, **Change tone**, **Custom…**. Each calls
`POST /api/documents/ai-edit` and renders the result as an inline suggestion.

Suggestions are custom TipTap marks: `endowInsert` (teal underline) and `endowDelete`
(red strikethrough), produced by a word-level `diff` between original and suggested text
within the selected range. A review bar offers **Accept**, **Reject**, **Accept all**.
Accept unwraps insert marks and deletes delete-marked text; Reject does the inverse. Only
one pending suggestion exists at a time; navigating away warns before discarding.

History: every accepted save creates a version snapshot. A versions drawer lists
timestamps with preview and **Restore**; restore creates a new version rather than
rewriting history. Autosave is debounced 800 ms; rename is inline on the title; export
menu offers Markdown, DOCX (`docx`), PDF (`jspdf`), and "Copy rich text"
(`ClipboardItem` with `text/html` + `text/plain`).

### 7.2 Data model

New Mongo collection `documents`:

```js
{
  _id,
  user: ObjectId,            // owner
  conversationId: String,    // LibreChat conversation
  artifactId: String,        // stable artifact identifier
  title: String,
  content: String,           // canonical Markdown
  versions: [{ id, content, title, createdAt, source }], // cap 50
  createdAt, updatedAt
}
```

Indexes: `{ user: 1, conversationId: 1, artifactId: 1 }` unique,
`{ user: 1, updatedAt: -1 }`.

Implemented in `packages/data-schemas/src/schema/document.ts`,
`models/document.ts`, `methods/document.ts`, registered in the three `index.ts` barrels so
`api/models` exposes `Document` automatically.

### 7.3 API (`/api/documents`, authenticated)

Types and the client data service live in `packages/data-provider/src/documents.ts`
(registered in `src/keys.ts`); logic lives in `packages/api/src/documents/` (TS, thin
`HighwayRouter`-style handlers); `api/server/routes/documents.js` is 10–20 lines of
requires and mounting. Validation uses zod; responses are plain JSON or safe error codes
(no raw upstream errors, per the error-disclosure rules).

| Method | Path | Body / notes |
|---|---|---|
| `GET` | `/` | list current user's documents (id, title, conversationId, artifactId, updatedAt) |
| `GET` | `/:conversationId/:artifactId` | full document + versions metadata |
| `PUT` | `/:conversationId/:artifactId` | `{ title, content, baseVersionId? }` → upsert, snapshot previous content, return doc |
| `DELETE` | `/:conversationId/:artifactId` | delete document |
| `GET` | `/:conversationId/:artifactId/versions/:versionId` | full version content |
| `POST` | `/:conversationId/:artifactId/restore` | `{ versionId }` → restore as new version |
| `POST` | `/ai-edit` | `{ text, instruction, model, mode }` → `{ text }` |

`ai-edit` validates `model` against an allow-list of the two configured IDs, caps input
(20k chars, configurable via `configSchema`; see below) and output, uses a fixed system
prompt (return only the replacement text, no preamble, preserve Markdown), calls the
OpenCode endpoint with `stream: false`, and maps upstream errors to safe stable codes
(`ai_edit_rate_limited`, `ai_edit_auth`, `ai_edit_unavailable`) the UI localizes. It never
logs document text.

New `configSchema` levers (all settable in `librechat.yaml`, defaults reproduce this plan):

```yaml
documents:
  aiEditMaxChars: 20000        # max selected text sent to the model
  aiEditMaxPerHour: 30         # inline edits allowed per user per hour
  versionHistoryCap: 50        # version snapshots per document
  autosaveDelayMs: 800         # client autosave debounce
  allowedAiEditModels: [deepseek-v4.1-flash]
```

`PUT` conflicts: if `baseVersionId` is supplied and is not the newest version, return
`409` with a `document_conflict` code and the current document so the client can show
"This document changed elsewhere".

### 7.4 Markdown ↔ editor

- Import: `marked` → HTML → TipTap `insertContent`. GFM tables, fenced code, links.
- Export: TipTap JSON → HTML → `turndown` + `turndown-plugin-gfm` → Markdown.
- DOCX: `docx` builds paragraphs/runs from the TipTap JSON (headings, lists, bold/italic,
  tables), downloaded client-side.
- PDF: `jspdf` text layout from Markdown (headings, paragraphs, lists); no server dependency.
- Round-trip tests cover headings, emphasis, lists, tables, links, code blocks.

### 7.5 Persistence and reopen

- On open: try `/api/documents/:conversationId/:artifactId`; if absent, seed from the
  artifact content in the message.
- Autosave writes `/api/documents` **and** `POST /api/messages/artifact/:messageId` with
  `{ index, original: artifact.content, updated: markdown }` so the chat transcript shows
  the latest document.
- `FilePreviewDialog` gains **Edit this document**: creates a document record from the
  extracted text, links it to the current conversation, and navigates to the editor.
- `/documents` lists documents with title, source, updated time, and open/delete actions.

---

## 8. RAG

- `rag-api` runs with `EMBEDDINGS_PROVIDER=ollama`,
  `EMBEDDINGS_MODEL=nomic-embed-text`, `OLLAMA_BASE_URL=http://ollama:11434`,
  `VECTOR_DB_TYPE=pgvector`, `DB_HOST=vectordb`, `DB_PORT=5432`.
- `ollama-init` pulls the embedding model before `rag_api` starts.
- LibreChat uses `RAG_API_URL=http://rag_api:8000`; file search runs through the ephemeral
  agent created by `fileSearch: true` on both model specs.
- Supported uploads: PDF, DOCX, TXT, MD (RAG API handles extraction).
- Citations: existing retrieval UI shows source file, page/snippet, and score; styled to
  brand and kept keyboard accessible.
- "Edit this document" on a retrieved file imports text into the document editor (§7.5).
- Failure modes surfaced in chat: RAG unreachable → "Document search is unavailable right
  now. You can still chat without files."; no results → model is told to say so instead of
  inventing sources.

---

## 9. Auth, config, and secrets

- Email/password only by default: `ALLOW_EMAIL_LOGIN=true`, `ALLOW_SOCIAL_LOGIN=false`,
  `ALLOW_REGISTRATION=true` (set `false` to close signups).
- First registered user becomes admin (LibreChat default).
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET`, `MEILI_MASTER_KEY`,
  `POSTGRES_PASSWORD`, `RAG_API_KEY` generated into `.env` (never committed); `.env` is
  gitignored, `.env.example` carries placeholders and a comment for every variable.
- `OPENCODE_API_KEY` is the only model credential, read from env.
- `librechat.yaml` is committed and contains no secrets (only `${VAR}` references).

Environment groups documented in `.env.example`:

1. Core (domain, port, app title, registration, secrets)
2. Models (`OPENCODE_API_KEY`, default model)
3. Database (`MONGO_URI`)
4. Search (`MEILI_*`, `SEARCH`)
5. RAG (`RAG_API_URL`, `RAG_PORT`, embeddings, pgvector, Postgres)
6. Branding / UI (`CUSTOM_FOOTER`; other UI levers are `librechat.yaml` configSchema fields)
7. Optional integrations left disabled

---

## 10. Tests

| Layer | Test | Tooling |
|---|---|---|
| Unit | Markdown ↔ HTML round-trip (headings, lists, tables, links, code) | Jest, client workspace |
| Unit | Word diff → insert/delete ranges; accept and reject transforms | Jest, client workspace |
| Unit | Version snapshot + restore semantics (restore appends, never rewrites) | Jest + `mongodb-memory-server` (data-schemas) |
| API | `/api/documents` auth, upsert, 409 conflict, version restore | Jest + supertest (owning workspace) |
| API | `/ai-edit` rejects unknown models and oversized input | Jest + supertest (owning workspace) |
| Component | Document editor states: loading, saved, conflict, pending suggestion | Jest, colocated `__tests__` |
| E2E-ish | Boot smoke: compose up, `/health`, login page renders, no LibreChat strings | Node script |
| Model smoke | Send "2+2?" and a document prompt to each model, assert streamed reply and artifact block | Node script (`scripts/smoke.mjs`) |

The model smoke test reads `OPENCODE_API_KEY` from the environment. Without it, the test
prints `SKIP` with a clear reason; the boot/UI checks still run. A local
OpenAI-compatible fake (optional `docker-compose.test.yml`) lets us exercise streaming and
artifact plumbing without the real key.

Run order for sign-off:
`npm run test:client` → `npm run test:api` → `docker compose up -d --build` →
`node scripts/smoke.mjs`.

---

## 11. Work order and commits

| Milestone | Scope | Commit |
|---|---|---|
| M0 | Plan, root scaffold, `.gitignore`, `.env.example`, git init | `chore: scaffold endowGPT with plan and env template` |
| M1 | Compose stack, `librechat.yaml`, model specs, boot check | `feat: docker stack with OpenCode-backed models` |
| M2 | Brand assets, favicons/PWA, splash video, theme, welcome/footer/starters | `feat: endowGPT branding, theme, and logo splash` |
| M3 | Artifact polish + document MIME + history | `feat: artifact panel polish and document artifact type` |
| M4 | Document schema/API, TipTap editor, markdown/export, autosave | `feat: document editor with persistence and exports` |
| M5 | Selection AI edits, diff accept/reject, versions/restore | `feat: inline AI edits, diffs, and document versions` |
| M6 | RAG stack, file import, citations, "edit this document" | `feat: RAG search, citations, and document import` |
| M7 | Tests, docs, report, branding sweep | `test: document, API, and boot smoke coverage` |

Each milestone ends with a working `docker compose up -d`, no uncommitted debris, and a
`CHANGES.md` update when core files were touched.

---

## 12. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Upstream model rejects artifact emulation or truncates long documents | Keep editor authoritative; targeted edits via `/ai-edit`; cap document prompt size and rely on editor for long content |
| DeepSeek tool-calling behavior | No document tool calls; artifact-in-markdown + REST fallback |
| `npm ci` inside Docker needs lockfile updated | Add client deps with `npm install` at repo root, commit `package-lock.json` |
| Large SVG logos inflate bundle | Ship cropped SVGs for UI, rasterized PNGs for icons, keep originals at root only |
| RAG first boot races embeddings | `ollama-init` completion gates `rag_api`; health checks on all |
| Version history growth | Cap 50 snapshots per document; prune oldest on write |
| Core edits drift from upstream | Small, isolated edits; every one listed in `CHANGES.md`; feature code in new modules |
| Secrets leakage | `.env` gitignored, only `${VAR}` in YAML, smoke script never prints tokens |

---

## 13. Done criteria

1. `docker compose up -d` from a clean clone (with `.env` filled) serves the app on
   `http://localhost:3080`.
2. The model label appears, it streams answers, title generation uses the same model, thinking
   is collapsible, and upstream errors read as plain English.
3. No LibreChat branding is visible anywhere a user looks, including the tab, PWA install,
   login, sidebar, welcome, footer, and About/credits page.
4. Splash plays once per session, is muted/skippable, and is replaced by a static logo for
   reduced motion.
5. Artifacts open in a resizable panel with Preview/Code, copy, download, fullscreen,
   sandboxing, and back/forward versions for both models.
6. A document can be created from chat, edited with formatting, edited by AI selection with
   accept/reject, versioned/restored, exported to MD/DOCX/PDF, and reopened from the
   conversation after a restart.
7. A PDF/DOCX/TXT/MD file can be uploaded, retrieved with citations, and imported into the
   document editor.
8. Tests in §10 pass or skip with a documented reason; `README.md` explains setup, and
   `CHANGES.md` lists every core file touched.
