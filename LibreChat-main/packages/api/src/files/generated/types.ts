export const GENERATED_SPREADSHEET_FORMATS = ['xlsx', 'csv'] as const;
export const GENERATED_DOCUMENT_FORMATS = ['docx', 'md'] as const;
export const GENERATED_PRESENTATION_FORMATS = ['pptx'] as const;

export type GeneratedSpreadsheetFormat = (typeof GENERATED_SPREADSHEET_FORMATS)[number];
export type GeneratedDocumentFormat = (typeof GENERATED_DOCUMENT_FORMATS)[number];
export type GeneratedPresentationFormat = (typeof GENERATED_PRESENTATION_FORMATS)[number];
export type GeneratedFormat =
  | GeneratedSpreadsheetFormat
  | GeneratedDocumentFormat
  | GeneratedPresentationFormat;

export type GeneratedFileKind = 'spreadsheet' | 'document' | 'presentation';

export type GeneratedFileCounts = {
  version: 1;
  tool: string;
  kind: GeneratedFileKind;
  format: GeneratedFormat;
  sheets?: number;
  rows?: number;
  slides?: number;
  blocks?: number;
};

export type RenderedGeneratedFile = {
  buffer: Buffer;
  filename: string;
  format: GeneratedFormat;
  mimeType: string;
  counts: GeneratedFileCounts;
};

export const GENERATED_FORMAT_MIME_TYPES: Record<GeneratedFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  md: 'text/markdown',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
