import ExcelJS from 'exceljs';
import JSZip from 'jszip';
import mammoth from 'mammoth';

/**
 * PptxGenJS's CJS build loads Node helpers through dynamic `import()`, which
 * Jest's VM does not support. The fake records the same slide surface and
 * emits a readable OOXML-shaped archive; the real writer is exercised by the
 * runtime smoke test against the built package.
 */
jest.mock('pptxgenjs', () => {
  const zipLibrary = jest.requireActual('jszip');
  class FakePptxGenJS {
    slides: Array<Record<string, unknown>> = [];

    ShapeType = { rect: 'rect' };

    layout = '';

    author = '';

    company = '';

    subject = '';

    title = '';

    addSlide() {
      const slide: Record<string, unknown> = {
        background: undefined,
        addText: jest.fn(),
        addShape: jest.fn(),
        addImage: jest.fn(),
        addNotes: jest.fn(),
      };
      this.slides.push(slide);
      return slide;
    }

    async write() {
      const zip = new zipLibrary();
      let notesCount = 0;
      this.slides.forEach((slide, index) => {
        const firstText = (slide.addText as jest.Mock).mock.calls[0]?.[0] ?? '';
        zip.file(
          `ppt/slides/slide${index + 1}.xml`,
          `<p:sld><a:t>${String(firstText)}</a:t></p:sld>`,
        );
        const notes = (slide.addNotes as jest.Mock).mock.calls[0]?.[0];
        if (typeof notes === 'string') {
          notesCount += 1;
          zip.file(
            `ppt/notesSlides/notesSlide${notesCount}.xml`,
            `<p:notes><a:t>${notes}</a:t></p:notes>`,
          );
        }
      });
      return zip.generateAsync({ type: 'nodebuffer' });
    }
  }
  return { __esModule: true, default: FakePptxGenJS };
});
import { DEFAULT_GENERATED_FILE_LIMITS } from './limits';
import {
  normalizeDocumentInput,
  normalizePresentationInput,
  normalizeSpreadsheetInput,
} from './schema';
import { renderDocument } from './document';
import { renderPresentation } from './presentation';
import { renderSpreadsheet } from './spreadsheet';

const limits = DEFAULT_GENERATED_FILE_LIMITS;

describe('spreadsheet renderer', () => {
  it('writes styled headers, frozen pane, autofilter, widths, formats, and fills', async () => {
    const normalized = normalizeSpreadsheetInput(
      {
        filename: 'Students.xlsx',
        sheets: [
          {
            name: 'Students',
            columns: [
              { header: 'Name', key: 'name', width: 24 },
              { header: 'Grade', key: 'grade', type: 'number', format: '0' },
            ],
            rows: [
              ['Alice', 92],
              ['Bob', 85],
            ],
            cellStyles: [{ range: 'A2:A3', fill: '#DBEAFE', bold: true }],
          },
        ],
      },
      limits,
    );
    const rendered = await renderSpreadsheet(normalized, limits);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(rendered.buffer as unknown as ArrayBuffer);
    const worksheet = workbook.getWorksheet('Students');

    expect(worksheet).toBeDefined();
    expect(worksheet?.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(worksheet?.autoFilter).toBe('A1:B1');
    expect(worksheet?.getColumn(1).width).toBe(24);
    expect(worksheet?.getCell('A1').fill).toMatchObject({
      type: 'pattern',
      fgColor: { argb: 'FF1F2937' },
    });
    expect(worksheet?.getCell('A1').font).toMatchObject({
      bold: true,
      color: { argb: 'FFFFFFFF' },
    });
    expect(worksheet?.getCell('A2').fill).toMatchObject({
      type: 'pattern',
      fgColor: { argb: 'FFDBEAFE' },
    });
    expect(worksheet?.getCell('A2').font?.bold).toBe(true);
    expect(worksheet?.getCell('B2').numFmt).toBe('0');
    expect(rendered.counts).toMatchObject({ sheets: 1, rows: 2 });
  });

  it('writes formulas without evaluating them', async () => {
    const normalized = normalizeSpreadsheetInput(
      {
        filename: 'Formula.xlsx',
        sheets: [
          {
            name: 'Sheet1',
            columns: [{ header: 'Total' }],
            rows: [['=SUM(A2:A3)']],
          },
        ],
      },
      limits,
    );
    const rendered = await renderSpreadsheet(normalized, limits);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(rendered.buffer as unknown as ArrayBuffer);
    const value = workbook.getWorksheet('Sheet1')?.getCell('A2').value;
    expect(value).toMatchObject({ formula: 'SUM(A2:A3)' });
  });

  it('escapes CSV formula injection and quotes unsafe values', async () => {
    const normalized = normalizeSpreadsheetInput(
      {
        filename: 'Students.csv',
        sheets: [
          {
            name: 'Students',
            columns: [{ header: 'Name' }, { header: 'Note' }],
            rows: [
              ['Alice', '=1+1'],
              ['Bob', 'a,b'],
            ],
          },
        ],
      },
      limits,
    );
    const rendered = await renderSpreadsheet(normalized, limits);
    expect(rendered.buffer.toString('utf8')).toBe(
      '\uFEFFName,Note\r\nAlice,\'=1+1\r\nBob,"a,b"\r\n',
    );
  });
});

describe('document renderer', () => {
  it('renders headings, lists, tables, and page breaks into docx', async () => {
    const normalized = normalizeDocumentInput(
      {
        filename: 'Report.docx',
        blocks: [
          { type: 'heading', level: 1, text: 'Student Report' },
          { type: 'paragraph', text: 'Summary paragraph.' },
          { type: 'list', items: ['First', 'Second'], ordered: true },
          { type: 'table', headers: ['Name', 'Grade'], rows: [['Alice', 92]] },
          { type: 'pagebreak' },
          { type: 'paragraph', text: 'Appendix.' },
        ],
      },
      limits,
    );
    const rendered = await renderDocument(normalized, limits);
    const extracted = await mammoth.extractRawText({ buffer: rendered.buffer });
    expect(extracted.value).toContain('Student Report');
    expect(extracted.value).toContain('1. First');
    expect(extracted.value).toContain('Alice');
    expect(extracted.value).toContain('Appendix.');
    expect(rendered.counts).toMatchObject({ blocks: 6, format: 'docx' });
  });

  it('renders markdown tables and page breaks', async () => {
    const normalized = normalizeDocumentInput(
      {
        filename: 'Report.md',
        blocks: [
          { type: 'heading', level: 2, text: 'Report' },
          { type: 'table', headers: ['Name', 'Grade'], rows: [['Alice', '92']] },
          { type: 'pagebreak' },
        ],
      },
      limits,
    );
    const rendered = await renderDocument(normalized, limits);
    expect(rendered.buffer.toString('utf8')).toBe(
      '## Report\n\n| Name | Grade |\n| --- | --- |\n| Alice | 92 |\n\n---\n',
    );
  });
});

describe('presentation renderer', () => {
  it('renders titled slides with notes', async () => {
    const normalized = normalizePresentationInput(
      {
        filename: 'Deck.pptx',
        slides: [
          { title: 'Student Results', bullets: ['Alice: 92'], notes: 'Speak slowly' },
          { title: 'Next Steps', bullets: ['Review'] },
        ],
      },
      limits,
    );
    const rendered = await renderPresentation(normalized, limits);
    const zip = await JSZip.loadAsync(rendered.buffer);
    const slides = Object.keys(zip.files).filter((name) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(name),
    );
    const notes = Object.keys(zip.files).filter((name) =>
      /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(name),
    );
    expect(slides).toHaveLength(2);
    expect(notes).toHaveLength(1);
    const firstSlide = await zip.file(slides[0])?.async('string');
    expect(firstSlide).toContain('Student Results');
    expect(rendered.counts).toMatchObject({ slides: 2, format: 'pptx' });
  });
});
