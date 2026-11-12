import filenamify from 'filenamify';
import { gfm } from 'micromark-extension-gfm';
import { gfmFromMarkdown } from 'mdast-util-gfm';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { excelMimeTypes } from 'librechat-data-provider';
import type { TAttachment, TFile } from 'librechat-data-provider';
import type { PhrasingContent } from 'mdast';
import type { Artifact } from '~/common';

/**
 * The artifact surfaces endowGPT keeps. Everything the model writes as
 * ordinary Markdown stays in the chat; only editable documents and files
 * produced by the native file tools reach the side panel.
 */
export const TOOL_ARTIFACT_TYPES = {
  MARKDOWN: 'text/markdown',
  DOCUMENT: 'application/vnd.endowgpt.document',
  DOCX: 'application/vnd.librechat.docx-preview',
  SPREADSHEET: 'application/vnd.librechat.spreadsheet-preview',
  PRESENTATION: 'application/vnd.librechat.presentation-preview',
  /** Any generated file without a dedicated viewer: card, download, hint. */
  FILE: 'application/vnd.librechat.file',
} as const;

export type ToolArtifactType = (typeof TOOL_ARTIFACT_TYPES)[keyof typeof TOOL_ARTIFACT_TYPES];

const TOOL_ARTIFACT_TYPE_VALUES: ReadonlySet<string> = new Set(Object.values(TOOL_ARTIFACT_TYPES));

export function isToolArtifactType(type: unknown): type is ToolArtifactType {
  return typeof type === 'string' && TOOL_ARTIFACT_TYPE_VALUES.has(type);
}

const ARTIFACT_TYPE_ALIASES: Record<string, string> = {
  'text/md': TOOL_ARTIFACT_TYPES.MARKDOWN,
  markdown: TOOL_ARTIFACT_TYPES.MARKDOWN,
  md: TOOL_ARTIFACT_TYPES.MARKDOWN,
  document: TOOL_ARTIFACT_TYPES.DOCUMENT,
  doc: TOOL_ARTIFACT_TYPES.DOCUMENT,
};

const CANONICAL_ARTIFACT_TYPES: ReadonlySet<string> = new Set<string>(
  Object.values(TOOL_ARTIFACT_TYPES),
);

/** The canonical type for any spelling an artifact arrives in. */
export function normalizeArtifactType(type: string): string {
  const key = type.trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(ARTIFACT_TYPE_ALIASES, key)) {
    return ARTIFACT_TYPE_ALIASES[key];
  }
  return CANONICAL_ARTIFACT_TYPES.has(key) ? key : type;
}

const basenameOf = (filename: string): string => {
  const slash = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
  return slash >= 0 ? filename.slice(slash + 1) : filename;
};

const extensionOf = (filename: string | undefined): string => {
  if (!filename) {
    return '';
  }
  const base = basenameOf(filename);
  const dot = base.lastIndexOf('.');
  if (dot < 0 || dot === base.length - 1) {
    return '';
  }
  return base.slice(dot + 1).toLowerCase();
};

/** Strip charset / boundary parameters so MIME comparisons stay exact. */
const baseMime = (mime: string | undefined): string => {
  if (!mime) {
    return '';
  }
  const semi = mime.indexOf(';');
  return (semi < 0 ? mime : mime.slice(0, semi)).trim().toLowerCase();
};

const FORMAT_TO_ARTIFACT_TYPE: Record<string, ToolArtifactType> = {
  md: TOOL_ARTIFACT_TYPES.MARKDOWN,
  markdown: TOOL_ARTIFACT_TYPES.MARKDOWN,
  mdx: TOOL_ARTIFACT_TYPES.MARKDOWN,
  docx: TOOL_ARTIFACT_TYPES.DOCX,
  xlsx: TOOL_ARTIFACT_TYPES.SPREADSHEET,
  xls: TOOL_ARTIFACT_TYPES.SPREADSHEET,
  csv: TOOL_ARTIFACT_TYPES.SPREADSHEET,
  ods: TOOL_ARTIFACT_TYPES.SPREADSHEET,
  pptx: TOOL_ARTIFACT_TYPES.PRESENTATION,
  potx: TOOL_ARTIFACT_TYPES.PRESENTATION,
};

function typeForGeneratedFile(
  format: string | undefined,
  mime: string | undefined,
  filename: string | undefined,
): ToolArtifactType {
  const extension = (format || extensionOf(filename)).toLowerCase();
  const byExtension = FORMAT_TO_ARTIFACT_TYPE[extension];
  if (byExtension != null) {
    return byExtension;
  }
  const normalizedMime = baseMime(mime);
  if (excelMimeTypes.test(normalizedMime) || normalizedMime === 'text/csv') {
    return TOOL_ARTIFACT_TYPES.SPREADSHEET;
  }
  if (normalizedMime === 'text/markdown') {
    return TOOL_ARTIFACT_TYPES.MARKDOWN;
  }
  return TOOL_ARTIFACT_TYPES.FILE;
}

/**
 * Classify a file for the panel. Only files produced by the native file
 * generation tools get an artifact surface; uploads and tool intermediates
 * keep their ordinary attachment chip, text preview, or download link.
 */
export function detectArtifactTypeFromFile(
  attachment: Partial<Pick<TFile, 'filename' | 'type' | 'text' | 'textFormat' | 'metadata'>>,
): ToolArtifactType | null {
  const generatedFile = attachment.metadata?.generatedFile;
  if (generatedFile == null) {
    return null;
  }
  return typeForGeneratedFile(generatedFile.format, attachment.type, attachment.filename);
}

/** Stable per-file key shared by the artifact registry and duplicate cards. */
export const toolArtifactKey = (
  file: Partial<Pick<TFile, 'file_id' | 'filename' | 'filepath'>>,
): string => `tool-artifact-${file.file_id ?? file.filename ?? file.filepath ?? 'unknown'}`;

const toLastUpdate = (file: Partial<Pick<TFile, 'updatedAt' | 'createdAt'>>): number => {
  const value = file.updatedAt ?? file.createdAt;
  if (value == null) {
    return 0;
  }
  const ms = new Date(value as string | number | Date).getTime();
  return Number.isFinite(ms) ? ms : 0;
};

interface FileToArtifactOptions {
  /** Markdown shown when the panel has no content to render yet. */
  placeholder?: string;
  /** Pre-classified type from a prior `detectArtifactTypeFromFile` call. */
  preClassifiedType?: ToolArtifactType;
}

/** Convert a generated-file attachment to the panel's `Artifact` shape. */
export function fileToArtifact(
  attachment: Partial<
    Pick<TAttachment, 'messageId'> &
      Pick<
        TFile,
        | 'file_id'
        | 'filename'
        | 'filepath'
        | 'type'
        | 'text'
        | 'textFormat'
        | 'updatedAt'
        | 'createdAt'
        | 'source'
        | 'user'
        | 'metadata'
        | 'bytes'
      >
  >,
  options?: FileToArtifactOptions,
): Artifact | null {
  const type = options?.preClassifiedType ?? detectArtifactTypeFromFile(attachment);
  if (!isToolArtifactType(type)) {
    return null;
  }
  const generatedFile = attachment.metadata?.generatedFile;
  return {
    id: toolArtifactKey(attachment),
    type,
    title: attachment.filename ?? 'Generated file',
    content: attachment.text ?? options?.placeholder ?? '',
    messageId: attachment.messageId ?? undefined,
    lastUpdateTime: toLastUpdate(attachment),
    download: {
      filename: attachment.filename || null,
      mimeType: attachment.type,
      filepath: attachment.filepath,
      file_id: attachment.file_id,
      source: attachment.source,
      user: attachment.user,
      ...(generatedFile != null ? { generatedFile } : {}),
      ...(attachment.bytes != null ? { bytes: attachment.bytes } : {}),
    },
  };
}

/** Name for bytes fetched from the original attachment, rather than its cached preview. */
export function getOriginalArtifactFilename(artifact: Artifact, fileKey: string): string {
  if (artifact.download?.filename) {
    return artifact.download.filename;
  }
  return artifact.title || fileKey;
}

/** Extract visible heading text without removing literal Markdown punctuation. */
function headingText(nodes: PhrasingContent[]): string {
  return nodes
    .map((node) => {
      if ('children' in node) {
        return headingText(node.children);
      }
      if (node.type === 'text' || node.type === 'inlineCode') {
        return node.value;
      }
      if (node.type === 'image' || node.type === 'imageReference') {
        return node.alt ?? '';
      }
      return '';
    })
    .join('');
}

const EXTENSION_BY_ARTIFACT_TYPE: Record<string, string> = {
  [TOOL_ARTIFACT_TYPES.MARKDOWN]: '.md',
  [TOOL_ARTIFACT_TYPES.DOCUMENT]: '.md',
  [TOOL_ARTIFACT_TYPES.DOCX]: '.docx',
  [TOOL_ARTIFACT_TYPES.SPREADSHEET]: '.xlsx',
  [TOOL_ARTIFACT_TYPES.PRESENTATION]: '.pptx',
};

/**
 * Name the downloaded bytes. Generated files normally download through their
 * original attachment route; this fallback names the panel content when no
 * route exists, and names edited documents before they are serialized.
 */
export function getArtifactDownloadFilename(
  artifact: Artifact,
  fileKey: string,
  content = artifact.content,
): string {
  const type = normalizeArtifactType(artifact.type ?? '');
  let title = (artifact.download?.filename ?? artifact.title)?.trim() ?? '';
  if (
    !title ||
    title === 'Generated artifact' ||
    title === 'Generated file' ||
    title === 'untitled'
  ) {
    title = '';
  }
  if (!title && (type === TOOL_ARTIFACT_TYPES.MARKDOWN || type === TOOL_ARTIFACT_TYPES.DOCUMENT)) {
    const markdown = (content ?? '').replace(
      /^\uFEFF?---[^\S\r\n]*\r?\n[\s\S]*?\r?\n(?:---|\.\.\.)[^\S\r\n]*(?:\r?\n|$)/,
      '',
    );
    const heading = fromMarkdown(markdown, {
      extensions: [gfm()],
      mdastExtensions: [gfmFromMarkdown()],
    }).children.find((node) => node.type === 'heading');
    if (heading?.type === 'heading') {
      title = headingText(heading.children).trim();
    }
  }
  const fallback = fileKey || 'document.md';
  const extension = EXTENSION_BY_ARTIFACT_TYPE[type] ?? fallback.slice(fallback.lastIndexOf('.'));
  const hasMatchingExtension = title.toLowerCase().endsWith(extension.toLowerCase());
  let filename = title || fallback;
  if (title && !hasMatchingExtension) {
    filename = `${title}${extension}`;
  }
  filename = filenamify(filename, { replacement: '_' });
  /* Without an original-file route the bytes are the cached extraction (or an
   * edit of it), never the stored binary, so label the copy honestly. */
  if (artifact.download && artifact.download.generatedFile == null) {
    const dot = filename.lastIndexOf('.');
    filename =
      dot > 0 ? `${filename.slice(0, dot)}.preview${filename.slice(dot)}` : `${filename}.preview`;
  }
  return filename;
}
