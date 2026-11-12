import { DEFAULT_GENERATED_FILE_LIMITS } from './limits';
import {
  GeneratedFileValidationError,
  normalizeDocumentInput,
  normalizePresentationInput,
  normalizeSpreadsheetInput,
} from './schema';
import { sanitizeGeneratedFilename } from './filename';
import type { SpreadsheetSheetInput } from './schema';

const limits = DEFAULT_GENERATED_FILE_LIMITS;

function sheet(overrides: Partial<SpreadsheetSheetInput> = {}): SpreadsheetSheetInput {
  return {
    name: 'Students',
    columns: [
      { header: 'Name', key: 'name' },
      { header: 'Grade', key: 'grade', type: 'number' },
    ],
    rows: [['Alice', 92]],
    ...overrides,
  };
}

describe('generated filename sanitization', () => {
  it('strips directories and forces the allowed extension', () => {
    expect(sanitizeGeneratedFilename('../../etc/passwd.xlsx', ['xlsx'], 'xlsx')).toEqual({
      filename: 'passwd.xlsx',
      format: 'xlsx',
    });
  });

  it('replaces a disallowed extension instead of keeping it', () => {
    expect(sanitizeGeneratedFilename('report.exe', ['xlsx'], 'xlsx')).toEqual({
      filename: 'report.xlsx',
      format: 'xlsx',
    });
  });

  it('falls back to a stable name when the input has no safe basename', () => {
    expect(sanitizeGeneratedFilename('..', ['xlsx'], 'xlsx')).toEqual({
      filename: 'generated-file.xlsx',
      format: 'xlsx',
    });
  });

  it('keeps allowed csv as csv', () => {
    expect(sanitizeGeneratedFilename('students.csv', ['xlsx', 'csv'], 'xlsx')).toEqual({
      filename: 'students.csv',
      format: 'csv',
    });
  });
});

describe('spreadsheet schema', () => {
  it('normalizes object rows by column key and pads missing values', () => {
    const result = normalizeSpreadsheetInput(
      {
        filename: 'Students.xlsx',
        sheets: [
          sheet({
            rows: [{ name: 'Alice' }, { name: 'Bob', grade: 80 }],
          }),
        ],
      },
      limits,
    );
    expect(result.sheets[0].rows).toEqual([
      ['Alice', null],
      ['Bob', 80],
    ]);
  });

  it('keeps formulas as strings so the renderer can write them as formulas', () => {
    const result = normalizeSpreadsheetInput(
      {
        filename: 'Students.xlsx',
        sheets: [sheet({ rows: [['Total', '=SUM(B2:B3)']] })],
      },
      limits,
    );
    expect(result.sheets[0].rows[0][1]).toBe('=SUM(B2:B3)');
  });

  it('sanitizes duplicate and invalid sheet names', () => {
    const result = normalizeSpreadsheetInput(
      {
        filename: 'Students.xlsx',
        sheets: [sheet({ name: 'Bad/Name' }), sheet({ name: 'Bad/Name' })],
      },
      limits,
    );
    expect(result.sheets.map((value) => value.name)).toEqual(['Bad_Name', 'Bad_Name (2)']);
  });

  it('rejects more sheets than the configured limit', () => {
    expect(() =>
      normalizeSpreadsheetInput(
        {
          filename: 'TooMany.xlsx',
          sheets: Array.from({ length: limits.maxSheets + 1 }, () => sheet()),
        },
        limits,
      ),
    ).toThrow(GeneratedFileValidationError);
  });

  it('rejects more rows than the configured total', () => {
    expect(() =>
      normalizeSpreadsheetInput(
        {
          filename: 'TooMany.xlsx',
          sheets: [sheet({ rows: Array.from({ length: limits.maxRows + 1 }, () => ['Alice', 1]) })],
        },
        limits,
      ),
    ).toThrow(/total row limit/);
  });

  it('rejects a multi-sheet CSV export', () => {
    expect(() =>
      normalizeSpreadsheetInput(
        { filename: 'Students.csv', sheets: [sheet(), sheet({ name: 'Other' })] },
        limits,
      ),
    ).toThrow(/CSV supports one sheet/);
  });

  it('rejects style ranges outside the spreadsheet bounds', () => {
    expect(() =>
      normalizeSpreadsheetInput(
        {
          filename: 'Students.xlsx',
          sheets: [sheet({ cellStyles: [{ range: 'A1:ZZ1', fill: '#fff' }] })],
        },
        limits,
      ),
    ).toThrow(/exceeds the configured spreadsheet bounds/);
  });

  it('rejects a style range large enough to allocate too many cells', () => {
    expect(() =>
      normalizeSpreadsheetInput(
        {
          filename: 'Students.xlsx',
          sheets: [sheet({ cellStyles: [{ range: 'A1:Z500', fill: '#fff' }] })],
        },
        limits,
      ),
    ).toThrow(/too large to style/);
  });

  it('rejects invalid colors', () => {
    expect(() =>
      normalizeSpreadsheetInput(
        {
          filename: 'Students.xlsx',
          sheets: [sheet({ cellStyles: [{ range: 'A1', fill: 'not-a-color' }] })],
        },
        limits,
      ),
    ).toThrow(/hex color/);
  });

  it('rejects oversized cell strings', () => {
    expect(() =>
      normalizeSpreadsheetInput(
        {
          filename: 'Students.xlsx',
          sheets: [sheet({ rows: [['x'.repeat(limits.maxCellCharacters + 1), 1]] })],
        },
        limits,
      ),
    ).toThrow(/character limit/);
  });

  it('rejects non-finite numbers', () => {
    expect(() =>
      normalizeSpreadsheetInput(
        { filename: 'Students.xlsx', sheets: [sheet({ rows: [['Alice', Infinity]] })] },
        limits,
      ),
    ).toThrow(/finite number/);
  });
});

describe('document schema', () => {
  it('normalizes blocks and pads table rows to the header width', () => {
    const result = normalizeDocumentInput(
      {
        filename: 'Report.docx',
        blocks: [
          { type: 'heading', level: 1, text: 'Report' },
          { type: 'list', items: ['One', 'Two'], ordered: true },
          { type: 'table', headers: ['Name', 'Grade'], rows: [['Alice', 92], ['Bob']] },
          { type: 'pagebreak' },
        ],
      },
      limits,
    );
    expect(result.blocks[2]).toEqual({
      type: 'table',
      headers: ['Name', 'Grade'],
      rows: [
        ['Alice', '92'],
        ['Bob', ''],
      ],
    });
  });

  it('rejects empty headings and empty lists', () => {
    expect(() =>
      normalizeDocumentInput(
        { filename: 'Report.docx', blocks: [{ type: 'heading', text: '   ' }] },
        limits,
      ),
    ).toThrow(/needs text/);
    expect(() =>
      normalizeDocumentInput(
        { filename: 'Report.docx', blocks: [{ type: 'list', items: ['   '] }] },
        limits,
      ),
    ).toThrow(/non-empty item/);
  });
});

describe('presentation schema', () => {
  it('accepts a small PNG data URL and keeps notes', () => {
    const image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lK3Q6wAAAABJRU5ErkJggg==';
    const result = normalizePresentationInput(
      {
        filename: 'Deck.pptx',
        slides: [{ title: 'Results', bullets: ['One'], notes: 'Speak slowly', image }],
      },
      limits,
    );
    expect(result.slides[0].notes).toBe('Speak slowly');
    expect(result.slides[0].image).toBe(image);
  });

  it('rejects remote image URLs', () => {
    expect(() =>
      normalizePresentationInput(
        {
          filename: 'Deck.pptx',
          slides: [{ title: 'Results', image: 'https://example.com/image.png' }],
        },
        limits,
      ),
    ).toThrow(/data URL/);
  });

  it('rejects an oversized embedded image', () => {
    const tooLarge = `data:image/png;base64,${Buffer.alloc(limits.maxImageBytes + 1).toString('base64')}`;
    expect(() =>
      normalizePresentationInput(
        { filename: 'Deck.pptx', slides: [{ title: 'Results', image: tooLarge }] },
        limits,
      ),
    ).toThrow(/byte limit/);
  });

  it('rejects empty slide titles', () => {
    expect(() =>
      normalizePresentationInput({ filename: 'Deck.pptx', slides: [{ title: '   ' }] }, limits),
    ).toThrow(/needs a title/);
  });
});
