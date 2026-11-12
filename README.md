# endowGPT

endowGPT is a branded, self-hosted ChatGPT-style workspace with Artifacts, a
Canvas-style document editor, and RAG over your own files. It is built on
[LibreChat](LICENSES.md#librechat) and its RAG API, with a lean deployment layer on
top: one compose file, one env file, and a curated model configuration.

- **Products**: chat with two hosted models, sandboxed Artifacts (HTML/code and
  documents), a full document editor with AI selection edits and version history,
  and retrieval-augmented chat with citations.
- **Stack**: Docker Compose · MongoDB · Meilisearch · RAG API · pgvector · Ollama
  (local embeddings).

---

## Quick start

Prerequisites: Docker Desktop (or Engine + Compose v2) and, to run the model smoke
test, Node 20+ in the shell.

On Windows, double-click (or run in a terminal):

```bat
start.bat   rem copies .env.example to .env on first run, waits for /health,
            rem prints http://localhost:3080 when ready; start.bat --build rebuilds
stop.bat    rem stops the stack, keeps all data; stop.bat --wipe deletes volumes
```

Cross-platform equivalent:

```sh
cp .env.example .env          # then fill in the values listed inside
docker compose up -d --build  # first run builds LibreChat and the RAG API
open http://localhost:3080    # register the first user (it becomes admin)
```

`.env` needs, at minimum:

| Variable | Notes |
|---|---|
| `OPENCODE_API_KEY` | credential for the OpenCode Go plan (`https://opencode.ai/inference/go/openai/v1`); stays out of git |
| `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET` | generate (48–64 random chars) |
| `CREDS_KEY`, `CREDS_IV` | exactly 64 / 32 hex chars |
| `MEILI_MASTER_KEY`, `POSTGRES_PASSWORD` | generate |

Everything generated once can stay untouched afterwards.

Useful commands:

```sh
docker compose ps              # health of each service
docker compose logs -f api     # tail the app
docker compose down            # stop (keeps volumes)
docker compose down -v         # stop and delete all data
```

---

## What the stack runs

| Service | Purpose |
|---|---|
| `api` | endowGPT app (LibreChat server + built SPA) on `:3080` |
| `mongodb` | users, conversations, messages, **documents** |
| `meilisearch` | conversation search |
| `rag_api` | file parsing, chunking, retrieval (`/health`, `/embed`, `/query`) |
| `vectordb` | pgvector Postgres for embeddings |
| `ollama` / `ollama-init` | local embeddings; init pulls `nomic-embed-text` once |

Only `api:3080` is exposed on the host.

### Models

A single OpenAI-compatible endpoint points at the OpenCode Go plan API
(`https://opencode.ai/inference/go/openai/v1`, credential from
`OPENCODE_API_KEY` only — this is **not** the pay-as-you-go `/zen/v1` surface).
Requests carry a stable `x-opencode-session` header (per user) and a client
User-Agent, which Go requires for routing and prompt caching. One model spec in
`LibreChat-main/librechat.yaml` gives the model its display name:

| Label | Model | Notes |
|---|---|---|
| endowGPT Fast | `deepseek-v4.1-flash` | default for new chats, titles, and document edits; artifacts + file search |

Streaming is always on; reasoning appears in a collapsible "Thinking" block;
upstream auth/rate/availability errors are mapped to readable messages.

### Documents and Artifacts

Artifacts open in the right-hand panel with Preview/Code tabs, copy, download,
fullscreen, and version back/forward. The `document` artifact type opens a TipTap
editor with headings, lists, tables, links, code blocks, Markdown/DOCX/PDF export,
autosave, inline AI selection edits with per-change accept/reject, and per-document
version history with restore. Documents are stored in MongoDB per user +
conversation + artifact id, and reopen from the originating conversation.

### Native file generation

The model can create real files instead of HTML artifacts that build a file in
the browser:

- `create_spreadsheet` -> `.xlsx` or `.csv` with styled headers, widths, frozen
  headers, filters, cell formatting, and formulas
- `create_document` -> `.docx` or `.md` from headings, paragraphs, lists,
  tables, and page breaks
- `create_presentation` -> `.pptx` with titled slides, bullets, notes, and
  optional embedded images

Each tool persists its bytes server-side, records the file against the signed-in
user and conversation, and emits the normal `attachment` SSE event. The chat
shows a file card with type, filename, and counts; Open loads the right-hand
viewer and Download returns the original binary.

The spreadsheet viewer is virtualized and pages through the stored workbook.
DOCX renders through `docx-preview`, Markdown through the chat renderer, and PDF
through `react-pdf`. PPTX needs LibreOffice for PPTX -> PDF conversion and is off
unless `ENABLE_PPTX_PREVIEW=true`; without it the card remains downloadable and
the panel shows a clean unavailable state. Viewer chunks are lazy: the initial
bundle does not include `react-pdf`, `pdfjs-dist`, or `docx-preview`.

Limits are environment-configurable in `.env.example`:
`FILE_TOOL_MAX_SHEETS`, `FILE_TOOL_MAX_ROWS`, `FILE_TOOL_MAX_BYTES`,
`FILE_TOOL_MAX_COLUMNS`, `FILE_TOOL_MAX_SLIDES`, `FILE_TOOL_MAX_BLOCKS`, and
`FILE_TOOL_RATE_LIMIT_PER_MINUTE`. Files follow the normal retention sweep.

To add a new generated type: add its format enum and MIME to
`packages/api/src/files/generated/types.ts`, a renderer under
`packages/api/src/files/generated/`, a zod branch in `schema.ts`, a tool entry
in `packages/api/src/tools/fileGenerationDefs.ts`, and a viewer branch under
`client/src/components/Artifacts/FilePreview/`. Keep the renderer in
`@librechat/api`, persist through `persistGeneratedFile`, and return
`{ generatedFile: TFile }` from the tool so the existing attachment pipeline
handles the message card and SSE event.

### RAG

Upload PDF, DOCX, TXT, or MD and ask about them; answers cite the retrieved
chunks (file, snippet, score). A "Edit this document" action on a retrieved file
imports the text into the document editor. Embeddings run locally via Ollama.
RAG failures surface as a calm, localized notice inside chat.

### Superadmin portal

Users holding the deployment's `access:admin` capability (the first registered
user is an admin by default) get a **Superadmin** entry in the sidebar and a
read-only portal at `/superadmin`:

- **Usage overview** for 24h / 7d / 30d / all time: total users and active
  users, conversations, messages, input/output/total tokens, daily usage, and
  usage by model.
- **Users table** with per-user conversation/message counts, input/output/total
  tokens, last activity, and search/pagination.
- **Chat history** for any user: browse their conversations, then read the
  message transcript (sender, time, model, tokens, text) without leaving the
  portal. Temporary chats and subagent threads are excluded, and private
  message fields are never read.

Token totals are summed from the per-request `transactions` records LibreChat
writes for each model call. If a deployment or date range has no request-level
usage, the portal falls back to the `tokenCount` stored on saved messages and
labels the numbers as estimates. The portal is strictly read-only: it cannot
delete users or conversations, impersonate a user, or start a chat.

Access is enforced on the server by the existing capability middleware
(`/api/superadmin` requires `access:admin`) and mirrored in the client by an
access probe, so granting or revoking the capability changes both the API and
the navigation entry.

---

## Configuration

- `LibreChat-main/librechat.yaml` — endpoint, model specs, theme tokens,
  welcome text, starters, and feature limits (e.g. `documents.aiEditMaxChars`).
- `.env` — secrets, domains, database and RAG wiring (documented inline).
- `scripts/brand-assets.mjs` — regenerates cropped logos, favicons, PWA icons,
  and Splash media from the source SVG/MP4 at the repo root.

## Tests

```sh
cd LibreChat-main
npm run test:api -- --testPathPatterns documents      # documents API
npm run test:client -- --testPathPatterns Document     # editor components
node ../scripts/smoke.mjs                             # boot + both models
node ../scripts/bench-files.mjs                       # 1k-row xlsx + cached preview
```

The model smoke test skips with a clear message when `OPENCODE_API_KEY` is unset;
boot/UI checks still run.

## Layout

```
LibreChat-main/      upstream LibreChat + endowGPT modules (see CHANGES.md)
rag-api-main/        upstream RAG API
scripts/             asset generation and smoke tests
docker-compose.yml   the whole stack
PLAN.md              design of record · CHANGES.md change log · REPORT.md closing report
```

## Credits & licenses

endowGPT is built on LibreChat and other open-source work; see `/credits`
inside the app and `LICENSES.md` for the upstream license notices.
