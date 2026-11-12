# Simplify audit — documents-only endowGPT

Scope: remove the stock LibreChat artifact system (React/HTML/SVG/Mermaid/code
Sandpack previews), keep the endowGPT document editor and native generated-file
cards, and reduce the visible UI to a calm chat surface. No changes to
`rag-api-main/`, `searxng/`, `pagesift/`, `docker-compose.yml`, or the
superadmin portal.

## REMOVE

| Area | Paths | Why |
|---|---|---|
| Server artifact prompt | `packages/api/src/prompts/artifacts/index.ts` and its imports in `agents/initialize.ts`, assistants/azure builders, `createRunBody.js` | Stock prompt teaches React/HTML/SVG/Mermaid artifacts and gates on `agent.artifacts`. Replace with a document-only prompt that always applies. |
| Model-spec artifact flag | `librechat.yaml` (`artifacts: true`), `packages/data-provider/src/config.ts` modelSpec parsing | Documents no longer depend on a per-model artifact capability. |
| Sandpack / Monaco | `client/src/components/Artifacts/Sandbox*`, `ArtifactPreview`, `ArtifactCodeEditor`, associated tests | Code sandbox and source editor are developer tools. |
| Artifact types | `client/src/utils/artifacts.ts` React/HTML/SVG/Mermaid/code entries and detection helpers | No non-document artifact can be created or opened. |
| Panel modes | Mermaid artifact tab, Markdown source tab, artifact undocking config (`interface.artifactUndocking`) | Simplify the panel to documents + generated files. Inline Mermaid in markdown answers stays. |
| Dependencies | `@codesandbox/sandpack-react`, `@monaco-editor/react`, `monaco-editor` | Only used by removed components. |
| Nav/UI entry points | Artifact-related nav links, sidebar marketplace links (non-superadmin), agent/MCP/prompt/bookmark/API-key panels in simple mode | Non-technical surface. Superadmin keeps admin access. |

## KEEP (unchanged behavior or contract)

| Area | Paths | Notes |
|---|---|---|
| Document editor | `client/src/components/Artifacts/Document/*`, `/documents` routes, document hooks/API | Create, edit, AI accept/reject, versions/restore, DOCX/PDF export must keep working. |
| Document persistence | `packages/api/src/documents/*`, `packages/data-schemas/*document*`, `packages/data-provider/src/documents.ts` | No API or schema changes. |
| Message artifact update | `packages/api/src/artifacts/update.ts`, `api/server/services/Artifacts/update.js`, `/api/messages/artifact/:messageId` | Live plumbing for saving document edits back to the message. Misleading names only. |
| Native files | `FileCard`, `FilePreview`, `GeneratedFileTabs`, `useAttachmentLink` | Generated DOCX/XLSX/PPTX/PDF cards and previews stay. |
| Inline Mermaid | Markdown renderer Mermaid component | Chat answers may still contain Mermaid fences; render as before. |
| Export helpers | `DownloadArtifact`, docx/jspdf/docx-preview deps | Document export continues. |

## REFACTOR

| Area | Paths | Change |
|---|---|---|
| Artifact container | `Artifacts.tsx`, `ArtifactTabs.tsx`, `Artifact.tsx`, `artifactPlugin` | Become a document/generated-file panel. Only `application/vnd.endowgpt.document` directives become editor cards; legacy `:::artifact` directives for other types are unwrapped so their fenced content renders as plain readable markdown. |
| Client artifact state | `client/src/store/artifacts.ts`, `useArtifacts`, panel claims | Keep document id/visibility/registry; drop type-specific registries and Sandpack state. |
| Attachment routing | `Attachment.tsx`, `attachmentTypes.ts` | Route only documents to the panel; everything else to file card/preview or plain text. |
| Prompt injection | New `packages/api/src/prompts/documents/index.ts` | Document creation/editing guidance injected on every run; no `agent.artifacts` gate. |
| Navigation | `useSideNavLinks.ts`, `ExpandedPanel.tsx`, `useUnifiedSidebarLinks.ts` | Simple mode shows New chat, search/history, documents; hide developer panels; superadmin bypass. |
| Chat presentation | messages list, markdown components, composer | ~700–760px centered reading column, quiet assistant output, subtle user bubble, one rounded composer, friendly empty state, streaming indicator. |
| Config/i18n | `librechat.yaml` starters/description, `client/src/locales/en/translation.json` | Everyday-language starters; remove artifact copy; add simple-mode copy. |

## Legacy behavior contract

Old conversations containing `:::artifact{type="text/html"}` (or React, SVG,
Mermaid, code) must render without crashing: drop the directive wrapper, keep the
inner fenced code as a normal markdown code block. Only document artifacts get
the “Open document” card.

## Verification plan

- `npm run build` for `packages/data-provider`, `packages/api`,
  `packages/data-schemas`, and the client; `npx tsc --noEmit` in touched
  workspaces.
- Focused Jest tests: documents API + editor, native file cards, legacy artifact
  rendering, superadmin access.
- Manual/Playwright: chat + stream, document create/open/edit/export, XLSX/DOCX/
  PPTX download, legacy artifact conversation, mobile width, dark mode,
  reduced motion.
- Grep for removed symbols: `Sandpack`, `monaco`, `MermaidArtifact`,
  `generateArtifactsPrompt`, `artifactUndocking`, artifact type maps.
