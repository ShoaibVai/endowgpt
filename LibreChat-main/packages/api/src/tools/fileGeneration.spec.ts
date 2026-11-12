import type { TFile } from 'librechat-data-provider';

jest.mock('pptxgenjs', () => {
  class FakePptxGenJS {
    ShapeType = { rect: 'rect' };

    addSlide() {
      return {
        background: undefined,
        addText: jest.fn(),
        addShape: jest.fn(),
        addImage: jest.fn(),
        addNotes: jest.fn(),
      };
    }

    async write() {
      return Buffer.from('pptx');
    }
  }
  return { __esModule: true, default: FakePptxGenJS };
});

import { DEFAULT_GENERATED_FILE_LIMITS } from '~/files/generated/limits';
import {
  CREATE_DOCUMENT_TOOL,
  CREATE_PRESENTATION_TOOL,
  CREATE_SPREADSHEET_TOOL,
  createDocumentTool,
  createPresentationTool,
  createSpreadsheetTool,
  getFileGenerationCatalogTools,
} from './fileGeneration';

const limits = DEFAULT_GENERATED_FILE_LIMITS;

function fakeFile(filename: string, type: string): TFile {
  return {
    file_id: '00000000-0000-4000-8000-000000000001',
    user: 'user-1',
    bytes: 10,
    filename,
    filepath: `/uploads/user-1/${filename}`,
    object: 'file',
    type,
    usage: 0,
    embedded: false,
  };
}

describe('file generation tools', () => {
  it('exposes the three catalog entries with provider-safe, simple schemas', () => {
    const catalog = getFileGenerationCatalogTools();
    expect(catalog.map((tool) => tool.name)).toEqual([
      CREATE_SPREADSHEET_TOOL,
      CREATE_DOCUMENT_TOOL,
      CREATE_PRESENTATION_TOOL,
    ]);
    const spreadsheet = catalog[0].schema as {
      $schema?: string;
      properties: {
        sheets: { items: { properties: { rows: unknown } } };
      };
    };
    expect(spreadsheet.$schema).toBeUndefined();
    expect(spreadsheet.properties.sheets.items.properties.rows).toEqual({
      type: 'array',
      items: {},
    });
  });

  it('creates a spreadsheet and returns a host artifact, not file bytes', async () => {
    const persist = jest.fn(async (file) => fakeFile(file.filename, file.mimeType));
    const tool = createSpreadsheetTool({ limits, persist });
    const args = {
      filename: 'Students.xlsx',
      sheets: [
        {
          name: 'Students',
          columns: [
            { header: 'Name', key: 'name' },
            { header: 'Grade', key: 'grade', type: 'number' },
          ],
          rows: [
            { name: 'Alice', grade: 92 },
            { name: 'Bob', grade: 85 },
          ],
        },
      ],
    };
    const result = await tool.invoke(args, {
      toolCall: { id: 'call-1', name: tool.name, args },
    } as never);

    expect(tool.responseFormat).toBe('content_and_artifact');
    expect(result.content).toContain('Created the spreadsheet');
    expect(result.artifact).toMatchObject({
      generatedFile: {
        file_id: '00000000-0000-4000-8000-000000000001',
        filename: 'Students.xlsx',
      },
    });
    expect(persist).toHaveBeenCalledWith(
      expect.objectContaining({
        filename: 'Students.xlsx',
        format: 'xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        counts: expect.objectContaining({ sheets: 1, rows: 2 }),
      }),
    );
  });

  it('turns an over-limit spreadsheet into a model-readable error without persisting', async () => {
    const persist = jest.fn(async (file) => fakeFile(file.filename, file.mimeType));
    const tool = createSpreadsheetTool({ limits, persist });
    const args = {
      filename: 'Students.xlsx',
      sheets: [
        {
          name: 'Students',
          columns: [{ header: 'Name' }],
          rows: Array.from({ length: limits.maxRows + 1 }, () => ['Alice']),
        },
      ],
    };
    const result = await tool.invoke(args, {
      toolCall: { id: 'call-2', name: tool.name, args },
    } as never);

    expect(result.content).toContain('Could not create the file');
    expect(result.content).toContain('total row limit');
    expect(result.artifact).toBeNull();
    expect(persist).not.toHaveBeenCalled();
  });

  it('creates a document and a presentation', async () => {
    const persist = jest.fn(async (file) => fakeFile(file.filename, file.mimeType));
    const document = createDocumentTool({ limits, persist });
    const presentation = createPresentationTool({ limits, persist });

    const documentArgs = {
      filename: 'Report.docx',
      blocks: [{ type: 'heading', text: 'Report' }],
    };
    const presentationArgs = {
      filename: 'Deck.pptx',
      slides: [{ title: 'Results', bullets: ['One'] }],
    };
    const documentResult = await document.invoke(documentArgs, {
      toolCall: { id: 'call-3', name: document.name, args: documentArgs },
    } as never);
    const presentationResult = await presentation.invoke(presentationArgs, {
      toolCall: { id: 'call-4', name: presentation.name, args: presentationArgs },
    } as never);

    expect(documentResult.artifact).toMatchObject({
      generatedFile: { filename: 'Report.docx' },
    });
    expect(presentationResult.artifact).toMatchObject({
      generatedFile: { filename: 'Deck.pptx' },
    });
    expect(persist).toHaveBeenCalledTimes(2);
  });
});
