import type { TGeneratedFileMetadata } from 'librechat-data-provider';

/** Inline Mermaid blocks use the same artifact-shaped export payload. */
export const MERMAID_ARTIFACT_TYPE = 'application/vnd.mermaid' as const;

/**
 * Original-file download metadata for artifacts backed by a real
 * code-interpreter file (e.g. an office document whose panel preview is
 * a server-rendered HTML render, not the binary itself). When present,
 * the panel download button fetches this file instead of serializing
 * the rendered preview `content`.
 */
export interface ArtifactDownload {
  /** Original attachment name; null means the attachment supplied no filename. */
  filename?: string | null;
  mimeType?: string;
  filepath?: string;
  file_id?: string;
  source?: string;
  user?: string;
  /** Present only for files created by the native file-generation tools. */
  generatedFile?: TGeneratedFileMetadata;
  bytes?: number;
}

export interface Artifact {
  id: string;
  lastUpdateTime: number;
  index?: number;
  messageId?: string;
  identifier?: string;
  language?: string;
  content?: string;
  title?: string;
  type?: string;
  download?: ArtifactDownload;
}
