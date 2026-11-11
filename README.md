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
| `OPENCODE_API_KEY` | credential for `https://opencode.ai/zen/v1`; stays out of git |
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

A single OpenAI-compatible endpoint points at `https://opencode.ai/zen/v1`
(credential from `OPENCODE_API_KEY` only). Model specs in
`LibreChat-main/librechat.yaml` give each model its display name:

| Label | Model | Notes |
|---|---|---|
| endowGPT Fast (DeepSeek) | `deepseek-v4.1-flash-free` | default for new chats; artifacts + file search |
| endowGPT Flash (GLM) | `glm-5.3-flash-free` | used for titles and cheap utility calls; artifacts + file search |

Streaming is always on; reasoning appears in a collapsible "Thinking" block;
upstream auth/rate/availability errors are mapped to readable messages.

### Documents and Artifacts

Artifacts open in the right-hand panel with Preview/Code tabs, copy, download,
fullscreen, and version back/forward. The `document` artifact type opens a TipTap
editor with headings, lists, tables, links, code blocks, Markdown/DOCX/PDF export,
autosave, inline AI selection edits with per-change accept/reject, and per-document
version history with restore. Documents are stored in MongoDB per user +
conversation + artifact id, and reopen from the originating conversation.

### RAG

Upload PDF, DOCX, TXT, or MD and ask about them; answers cite the retrieved
chunks (file, snippet, score). A "Edit this document" action on a retrieved file
imports the text into the document editor. Embeddings run locally via Ollama.
RAG failures surface as a calm, localized notice inside chat.

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
