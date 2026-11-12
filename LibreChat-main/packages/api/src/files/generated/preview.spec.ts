import ExcelJS from 'exceljs';
import { DEFAULT_GENERATED_FILE_LIMITS } from './limits';
import { normalizeSpreadsheetInput } from './schema';
import {
  clearSpreadsheetPreviewCache,
  getSpreadsheetPreview,
  SpreadsheetPreviewError,
} from './preview';
import { renderSpreadsheet } from './spreadsheet';

const limits = DEFAULT_GENERATED_FILE_LIMITS;

async function workbookBuffer(): Promise<Buffer> {
  const normalized = normalizeSpreadsheetInput(
    {
      filename: 'Students.xlsx',
      sheets: [
        {
          name: 'Students',
          columns: [
            { header: 'Name', key: 'name', width: 22 },
            { header: 'Grade', key: 'grade', type: 'number' },
          ],
          rows: [
            ['Alice', 92],
            ['Bob', 85],
            ['Carmen', 78],
          ],
          cellStyles: [{ range: 'A2:A4', fill: '#DBEAFE', bold: true }],
        },
        {
          name: 'Summary',
          columns: [{ header: 'Metric' }, { header: 'Value' }],
          rows: [['Average', 85]],
        },
      ],
    },
    limits,
  );
  const rendered = await renderSpreadsheet(normalized, limits);
  return rendered.buffer;
}

describe('spreadsheet preview', () => {
  beforeEach(() => {
    clearSpreadsheetPreviewCache();
  });

  it('returns sheet metadata and a paged row window', async () => {
    const buffer = await workbookBuffer();
    const preview = await getSpreadsheetPreview({
      fileId: 'file-1',
      filename: 'Students.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      buffer,
      sheet: 0,
      offset: 1,
      limit: 1,
    });

    expect(preview.totalSheets).toBe(2);
    expect(preview.totalRows).toBe(4);
    expect(preview.truncated).toBe(true);
    expect(preview.sheets[0]).toMatchObject({
      name: 'Students',
      index: 0,
      offset: 1,
      limit: 1,
      totalRows: 3,
      frozenRows: 1,
      autoFilter: 'A1:B1',
    });
    expect(preview.sheets[0].columns).toMatchObject([
      { header: 'Name', width: 22 },
      { header: 'Grade' },
    ]);
    expect(preview.sheets[0].rows).toEqual([['Bob', 85]]);
    expect(preview.sheets[0].styles).toMatchObject({
      A3: { fill: '#DBEAFE', bold: true },
    });
    expect(preview.sheets[1].rows).toEqual([]);
    expect(preview.sheets[1].totalRows).toBe(1);
  });

  it('parses csv into a single sheet and detects injection-safe values as text', async () => {
    const preview = await getSpreadsheetPreview({
      fileId: 'file-csv',
      filename: 'Students.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('\uFEFFName,Grade\r\nAlice,92\r\nBob,85\r\n', 'utf8'),
      limit: 10,
    });
    expect(preview.sheets).toHaveLength(1);
    expect(preview.sheets[0].columns.map((column) => column.header)).toEqual(['Name', 'Grade']);
    expect(preview.sheets[0].rows).toEqual([
      ['Alice', '92'],
      ['Bob', '85'],
    ]);
    expect(preview.sheets[0].autoFilter).toBe('A1:B1');
  });

  it('rejects unsupported file types with a stable code', async () => {
    await expect(
      getSpreadsheetPreview({
        fileId: 'file-doc',
        filename: 'Report.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        buffer: Buffer.from('not a spreadsheet'),
      }),
    ).rejects.toMatchObject({ code: 'unsupported' });
  });

  it('rejects a sheet index that does not exist', async () => {
    const buffer = await workbookBuffer();
    await expect(
      getSpreadsheetPreview({
        fileId: 'file-2',
        filename: 'Students.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer,
        sheet: 99,
      }),
    ).rejects.toBeInstanceOf(SpreadsheetPreviewError);
  });

  it('loads a workbook with no data rows without failing', async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Empty');
    worksheet.addRow(['Name', 'Grade']);
    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const preview = await getSpreadsheetPreview({
      fileId: 'file-empty',
      filename: 'Empty.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    });
    expect(preview.sheets[0].rows).toEqual([]);
    expect(preview.sheets[0].totalRows).toBe(0);
  });
});
