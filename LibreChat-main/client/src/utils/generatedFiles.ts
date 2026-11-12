import type { TGeneratedFileMetadata } from 'librechat-data-provider';

export type GeneratedFileVisualKind = 'spreadsheet' | 'document' | 'presentation' | 'markdown';

export function generatedFileVisualKind(metadata: TGeneratedFileMetadata): GeneratedFileVisualKind {
  if (metadata.format === 'xlsx' || metadata.format === 'csv') {
    return 'spreadsheet';
  }
  if (metadata.format === 'pptx') {
    return 'presentation';
  }
  if (metadata.format === 'docx') {
    return 'document';
  }
  return 'markdown';
}

export function generatedFileFormatLabel(metadata: TGeneratedFileMetadata): string {
  return metadata.format.toUpperCase();
}

export function generatedFileKindLabelKey(
  metadata: TGeneratedFileMetadata,
):
  | 'com_ui_file_type_spreadsheet'
  | 'com_ui_file_type_document'
  | 'com_ui_file_type_presentation'
  | 'com_ui_file_type_text' {
  const kind = generatedFileVisualKind(metadata);
  if (kind === 'spreadsheet') {
    return 'com_ui_file_type_spreadsheet';
  }
  if (kind === 'presentation') {
    return 'com_ui_file_type_presentation';
  }
  if (kind === 'document') {
    return 'com_ui_file_type_document';
  }
  return 'com_ui_file_type_text';
}
