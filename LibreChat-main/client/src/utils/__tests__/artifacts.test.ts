import { FileSources } from 'librechat-data-provider';
import type { TGeneratedFileMetadata } from 'librechat-data-provider';
import {
  detectArtifactTypeFromFile,
  fileToArtifact,
  getArtifactDownloadFilename,
  getOriginalArtifactFilename,
  isToolArtifactType,
  normalizeArtifactType,
  toolArtifactKey,
  TOOL_ARTIFACT_TYPES,
} from '../artifacts';

const generatedFile = (
  format: TGeneratedFileMetadata['format'] = 'docx',
  kind: TGeneratedFileMetadata['kind'] = 'document',
): TGeneratedFileMetadata => ({
  version: 1,
  tool: 'write_file',
  kind,
  format,
});

describe('artifact types', () => {
  it('keeps only document and generated-file surfaces', () => {
    expect(TOOL_ARTIFACT_TYPES).toEqual({
      MARKDOWN: 'text/markdown',
      DOCUMENT: 'application/vnd.endowgpt.document',
      DOCX: 'application/vnd.librechat.docx-preview',
      SPREADSHEET: 'application/vnd.librechat.spreadsheet-preview',
      PRESENTATION: 'application/vnd.librechat.presentation-preview',
      FILE: 'application/vnd.librechat.file',
    });
  });

  it('normalizes document aliases without inventing removed types', () => {
    expect(normalizeArtifactType('text/md')).toBe(TOOL_ARTIFACT_TYPES.MARKDOWN);
    expect(normalizeArtifactType('markdown')).toBe(TOOL_ARTIFACT_TYPES.MARKDOWN);
    expect(normalizeArtifactType('MD')).toBe(TOOL_ARTIFACT_TYPES.MARKDOWN);
    expect(normalizeArtifactType('document')).toBe(TOOL_ARTIFACT_TYPES.DOCUMENT);
    expect(normalizeArtifactType('document')).toBe(TOOL_ARTIFACT_TYPES.DOCUMENT);
    expect(normalizeArtifactType('application/vnd.endowgpt.document')).toBe(
      TOOL_ARTIFACT_TYPES.DOCUMENT,
    );
  });

  it('leaves unknown or removed artifact types untouched', () => {
    expect(normalizeArtifactType('text/html')).toBe('text/html');
    expect(normalizeArtifactType('application/vnd.react')).toBe('application/vnd.react');
    expect(normalizeArtifactType('application/vnd.mermaid')).toBe('application/vnd.mermaid');
  });

  it('recognizes only current tool artifact types', () => {
    expect(isToolArtifactType(TOOL_ARTIFACT_TYPES.DOCUMENT)).toBe(true);
    expect(isToolArtifactType(TOOL_ARTIFACT_TYPES.FILE)).toBe(true);
    expect(isToolArtifactType('text/html')).toBe(false);
    expect(isToolArtifactType('application/vnd.code')).toBe(false);
    expect(isToolArtifactType(undefined)).toBe(false);
  });
});

describe('detectArtifactTypeFromFile', () => {
  it('ignores uploads and tool intermediates', () => {
    expect(detectArtifactTypeFromFile({ filename: 'report.docx', type: 'application/docx' })).toBe(
      null,
    );
    expect(
      detectArtifactTypeFromFile({
        filename: 'chart.png',
        type: 'image/png',
        metadata: {},
      }),
    ).toBeNull();
  });

  it('classifies native generated documents by format', () => {
    expect(
      detectArtifactTypeFromFile({
        filename: 'report.docx',
        metadata: { generatedFile: generatedFile('docx', 'document') },
      }),
    ).toBe(TOOL_ARTIFACT_TYPES.DOCX);

    expect(
      detectArtifactTypeFromFile({
        filename: 'data.xlsx',
        metadata: { generatedFile: generatedFile('xlsx', 'spreadsheet') },
      }),
    ).toBe(TOOL_ARTIFACT_TYPES.SPREADSHEET);

    expect(
      detectArtifactTypeFromFile({
        filename: 'slides.pptx',
        metadata: { generatedFile: generatedFile('pptx', 'presentation') },
      }),
    ).toBe(TOOL_ARTIFACT_TYPES.PRESENTATION);
  });

  it('uses the metadata format before the filename extension', () => {
    expect(
      detectArtifactTypeFromFile({
        filename: 'renamed.bin',
        metadata: { generatedFile: generatedFile('md', 'document') },
      }),
    ).toBe(TOOL_ARTIFACT_TYPES.MARKDOWN);
  });

  it('falls back to the filename extension when the format is missing', () => {
    expect(
      detectArtifactTypeFromFile({
        filename: 'notes.md',
        metadata: { generatedFile: { ...generatedFile('md'), format: undefined as never } },
      }),
    ).toBe(TOOL_ARTIFACT_TYPES.MARKDOWN);
  });

  it('uses MIME and CSV as a spreadsheet fallback', () => {
    expect(
      detectArtifactTypeFromFile({
        filename: 'download',
        type: 'text/csv',
        metadata: { generatedFile: generatedFile('csv', 'spreadsheet') },
      }),
    ).toBe(TOOL_ARTIFACT_TYPES.SPREADSHEET);
    expect(
      detectArtifactTypeFromFile({
        filename: 'download',
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        metadata: { generatedFile: { ...generatedFile('csv'), format: undefined as never } },
      }),
    ).toBe(TOOL_ARTIFACT_TYPES.SPREADSHEET);
  });

  it('keeps an unrecognized generated file as a plain file card', () => {
    expect(
      detectArtifactTypeFromFile({
        filename: 'archive.zip',
        type: 'application/zip',
        metadata: { generatedFile: { ...generatedFile('md'), format: 'zip' as never } },
      }),
    ).toBe(TOOL_ARTIFACT_TYPES.FILE);
  });
});

describe('tool artifact keys', () => {
  it('prefers the file id and falls back to name and path', () => {
    expect(toolArtifactKey({ file_id: 'file-1', filename: 'a.docx' })).toBe('tool-artifact-file-1');
    expect(toolArtifactKey({ filename: 'a.docx' })).toBe('tool-artifact-a.docx');
    expect(toolArtifactKey({ filepath: '/tmp/a.docx' })).toBe('tool-artifact-/tmp/a.docx');
    expect(toolArtifactKey({})).toBe('tool-artifact-unknown');
  });
});

describe('fileToArtifact', () => {
  it('converts a generated file into a panel artifact', () => {
    const artifact = fileToArtifact({
      file_id: 'file-1',
      filename: 'Quarterly report.docx',
      filepath: '/uploads/user/file-1__Quarterly report.docx',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      text: 'Cached preview',
      messageId: 'message-1',
      source: FileSources.local,
      user: 'user-1',
      bytes: 2048,
      updatedAt: '2026-01-02T03:04:05.000Z',
      metadata: { generatedFile: generatedFile('docx', 'document') },
    });

    expect(artifact).toEqual({
      id: 'tool-artifact-file-1',
      type: TOOL_ARTIFACT_TYPES.DOCX,
      title: 'Quarterly report.docx',
      content: 'Cached preview',
      messageId: 'message-1',
      lastUpdateTime: new Date('2026-01-02T03:04:05.000Z').getTime(),
      download: {
        filename: 'Quarterly report.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        filepath: '/uploads/user/file-1__Quarterly report.docx',
        file_id: 'file-1',
        source: FileSources.local,
        user: 'user-1',
        generatedFile: generatedFile('docx', 'document'),
        bytes: 2048,
      },
    });
  });

  it('uses the placeholder when the attachment has no cached text', () => {
    const artifact = fileToArtifact(
      {
        file_id: 'file-2',
        filename: 'notes.md',
        metadata: { generatedFile: generatedFile('md', 'document') },
      },
      { placeholder: 'Preparing preview…' },
    );

    expect(artifact?.content).toBe('Preparing preview…');
  });

  it('accepts a pre-classified type', () => {
    const artifact = fileToArtifact(
      {
        file_id: 'file-3',
        filename: 'no-extension',
      },
      { preClassifiedType: TOOL_ARTIFACT_TYPES.FILE },
    );

    expect(artifact?.type).toBe(TOOL_ARTIFACT_TYPES.FILE);
  });

  it('refuses anything that is not a native generated file', () => {
    expect(
      fileToArtifact({
        file_id: 'file-4',
        filename: 'upload.png',
        type: 'image/png',
      }),
    ).toBeNull();
  });

  it('records the latest timestamp it can find', () => {
    const artifact = fileToArtifact({
      file_id: 'file-5',
      filename: 'notes.md',
      createdAt: '2026-01-01T00:00:00.000Z',
      metadata: { generatedFile: generatedFile('md', 'document') },
    });

    expect(artifact?.lastUpdateTime).toBe(new Date('2026-01-01T00:00:00.000Z').getTime());
  });
});

describe('artifact download names', () => {
  it('prefers the original attachment name', () => {
    expect(
      getOriginalArtifactFilename(
        {
          id: 'tool-artifact-file-1',
          lastUpdateTime: 0,
          title: 'Quarterly report.docx',
          download: { filename: 'Q1 report.docx' },
        },
        'fallback.docx',
      ),
    ).toBe('Q1 report.docx');
  });

  it('falls back to the title, then the file key', () => {
    expect(
      getOriginalArtifactFilename(
        { id: 'tool-artifact-file-1', lastUpdateTime: 0, title: 'Notes' },
        'fallback.md',
      ),
    ).toBe('Notes');
    expect(
      getOriginalArtifactFilename({ id: 'tool-artifact-file-1', lastUpdateTime: 0 }, 'fallback.md'),
    ).toBe('fallback.md');
  });

  it('adds the extension implied by the artifact type', () => {
    expect(
      getArtifactDownloadFilename(
        {
          id: 'tool-artifact-file-1',
          lastUpdateTime: 0,
          title: 'Quarterly report',
          type: TOOL_ARTIFACT_TYPES.DOCX,
          download: { generatedFile: generatedFile('docx', 'document') },
        },
        'document.docx',
      ),
    ).toBe('Quarterly report.docx');
  });

  it('uses the first heading when an untitled document has no filename', () => {
    expect(
      getArtifactDownloadFilename(
        {
          id: 'tool-artifact-file-2',
          lastUpdateTime: 0,
          type: TOOL_ARTIFACT_TYPES.MARKDOWN,
          download: { generatedFile: generatedFile('md', 'document') },
        },
        'document.md',
        '# Quarterly report\n\nBody',
      ),
    ).toBe('Quarterly report.md');
  });

  it('marks cached previews honestly when no generated binary exists', () => {
    expect(
      getArtifactDownloadFilename(
        {
          id: 'tool-artifact-file-3',
          lastUpdateTime: 0,
          title: 'notes.md',
          type: TOOL_ARTIFACT_TYPES.MARKDOWN,
          download: {},
        },
        'document.md',
      ),
    ).toBe('notes.preview.md');
  });

  it('sanitizes characters the filesystem rejects', () => {
    expect(
      getArtifactDownloadFilename(
        {
          id: 'tool-artifact-file-4',
          lastUpdateTime: 0,
          title: 'Q1: "plan"',
          type: TOOL_ARTIFACT_TYPES.DOCX,
          download: { generatedFile: generatedFile('docx', 'document') },
        },
        'document.docx',
      ),
    ).toBe('Q1_ _plan_.docx');
  });
});
