import ExcelJS from 'exceljs';
import type { GeneratedFileLimits } from './limits';
import type {
  NormalizedConditionalFormat,
  NormalizedSpreadsheetColumn,
  NormalizedSpreadsheetInput,
  NormalizedSpreadsheetSheet,
} from './schema';
import type { RenderedGeneratedFile } from './types';
import { GENERATED_FORMAT_MIME_TYPES } from './types';

const HEADER_FILL = 'FF1F2937';
const HEADER_TEXT = 'FFFFFFFF';
const BORDER_COLOR = 'FFCBD5E1';

function columnLetter(columnNumber: number): string {
  let value = columnNumber;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function defaultColumnWidth(column: NormalizedSpreadsheetColumn): number {
  return Math.min(40, Math.max(10, column.header.length + 4));
}

function numericFormat(column: NormalizedSpreadsheetColumn): string | undefined {
  if (column.format != null) {
    return column.format;
  }
  switch (column.type) {
    case 'currency':
      return '$#,##0.00';
    case 'percent':
      return '0.00%';
    case 'date':
      return 'yyyy-mm-dd';
    default:
      return undefined;
  }
}

function toCellValue(
  value: string | number | boolean | null,
  column: NormalizedSpreadsheetColumn,
): ExcelJS.CellValue {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string' && value.startsWith('=')) {
    return { formula: value.slice(1) };
  }
  if (typeof value === 'string' && column.type === 'date') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return value;
}

function applyHeaderStyle(worksheet: ExcelJS.Worksheet, columnCount: number): void {
  const header = worksheet.getRow(1);
  header.height = 22;
  for (let column = 1; column <= columnCount; column++) {
    const cell = header.getCell(column);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.font = { bold: true, color: { argb: HEADER_TEXT }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
    cell.border = {
      bottom: { style: 'thin', color: { argb: BORDER_COLOR } },
    };
  }
}

function applyCellStyles(worksheet: ExcelJS.Worksheet, sheet: NormalizedSpreadsheetSheet): void {
  for (const style of sheet.cellStyles) {
    for (let row = style.cells.startRow; row <= style.cells.endRow; row++) {
      for (let column = style.cells.startColumn; column <= style.cells.endColumn; column++) {
        const cell = worksheet.getCell(row, column);
        if (style.fill != null) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: style.fill } };
        }
        if (style.fontColor != null || style.bold != null || style.italic != null) {
          cell.font = {
            ...cell.font,
            ...(style.fontColor != null ? { color: { argb: style.fontColor } } : {}),
            ...(style.bold != null ? { bold: style.bold } : {}),
            ...(style.italic != null ? { italic: style.italic } : {}),
          };
        }
        if (style.align != null) {
          cell.alignment = { ...cell.alignment, horizontal: style.align };
        }
      }
    }
  }
}

function conditionalStyle(format: NormalizedConditionalFormat): Partial<ExcelJS.Style> | undefined {
  const { style } = format;
  if (
    style.fill == null &&
    style.fontColor == null &&
    style.bold == null &&
    style.italic == null &&
    style.align == null
  ) {
    return undefined;
  }
  const result: Partial<ExcelJS.Style> = {};
  if (style.fill != null) {
    result.fill = {
      type: 'pattern',
      pattern: 'solid',
      bgColor: { argb: style.fill },
      fgColor: { argb: style.fill },
    };
  }
  if (style.fontColor != null || style.bold != null || style.italic != null) {
    result.font = {
      ...(style.fontColor != null ? { color: { argb: style.fontColor } } : {}),
      ...(style.bold != null ? { bold: style.bold } : {}),
      ...(style.italic != null ? { italic: style.italic } : {}),
    };
  }
  return result;
}

function applyConditionalFormats(
  worksheet: ExcelJS.Worksheet,
  sheet: NormalizedSpreadsheetSheet,
): void {
  sheet.conditionalFormats.forEach((format, index) => {
    const style = conditionalStyle(format);
    if (format.rule === 'containsText') {
      worksheet.addConditionalFormatting({
        ref: format.range,
        rules: [
          {
            type: 'containsText',
            operator: 'containsText',
            text: String(format.value ?? ''),
            priority: index + 1,
            ...(style != null ? { style } : {}),
          },
        ],
      });
      return;
    }

    let operator: ExcelJS.CellIsOperators = 'equal';
    if (
      format.rule === 'greaterThan' ||
      format.rule === 'lessThan' ||
      format.rule === 'equal' ||
      format.rule === 'between'
    ) {
      operator = format.rule;
    }
    const formulae =
      format.rule === 'between' ? (format.values ?? []).map(String) : [String(format.value ?? '')];
    const rule: ExcelJS.CellIsRuleType = {
      type: 'cellIs',
      operator,
      formulae,
      priority: index + 1,
      ...(style != null ? { style } : {}),
    };
    worksheet.addConditionalFormatting({
      ref: format.range,
      rules: [rule],
    });
  });
}

function addSheet(workbook: ExcelJS.Workbook, sheet: NormalizedSpreadsheetSheet): void {
  const worksheet = workbook.addWorksheet(sheet.name, {
    properties: { defaultRowHeight: 18 },
    views: sheet.freezeHeader ? [{ state: 'frozen', ySplit: 1 }] : [],
  });
  worksheet.columns = sheet.columns.map((column) => ({
    header: column.header,
    key: column.key,
    width: column.width ?? defaultColumnWidth(column),
  }));
  applyHeaderStyle(worksheet, sheet.columns.length);

  for (const row of sheet.rows) {
    const added = worksheet.addRow(
      row.map((value, index) => toCellValue(value, sheet.columns[index])),
    );
    if (sheet.columns.some((column) => column.type === 'date' || column.format != null)) {
      added.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
        const column = sheet.columns[columnNumber - 1];
        const format = column != null ? numericFormat(column) : undefined;
        if (format != null) {
          cell.numFmt = format;
        }
      });
    }
  }

  if (sheet.autoFilter) {
    const lastColumn = columnLetter(sheet.columns.length);
    worksheet.autoFilter = `A1:${lastColumn}1`;
  }
  applyCellStyles(worksheet, sheet);
  applyConditionalFormats(worksheet, sheet);
  worksheet.views = sheet.freezeHeader ? [{ state: 'frozen', ySplit: 1 }] : [];
}

function escapeCsvValue(value: string | number | boolean | null): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  let text = value;
  /* CSV has no formulas. Prefix the characters a spreadsheet would treat as
   * the start of a formula so a model-authored cell cannot become a CSV
   * injection payload when the download is opened in Excel or Sheets. */
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function renderCsv(input: NormalizedSpreadsheetInput): Buffer {
  const sheet = input.sheets[0];
  const lines: string[] = [];
  lines.push(sheet.columns.map((column) => escapeCsvValue(column.header)).join(','));
  for (const row of sheet.rows) {
    lines.push(row.map((value) => escapeCsvValue(value)).join(','));
  }
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

/** Renders a validated workbook to xlsx or csv bytes. */
export async function renderSpreadsheet(
  input: NormalizedSpreadsheetInput,
  limits: GeneratedFileLimits,
): Promise<RenderedGeneratedFile> {
  let buffer: Buffer;
  if (input.format === 'csv') {
    buffer = renderCsv(input);
  } else {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'endowGPT';
    workbook.lastModifiedBy = 'endowGPT';
    workbook.created = new Date();
    workbook.modified = new Date();
    for (const sheet of input.sheets) {
      addSheet(workbook, sheet);
    }
    buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  }

  if (buffer.length > limits.maxBytes) {
    throw new Error(
      `The generated ${input.format.toUpperCase()} file exceeds the ${limits.maxBytes} byte limit`,
    );
  }

  return {
    buffer,
    filename: input.filename,
    format: input.format,
    mimeType: GENERATED_FORMAT_MIME_TYPES[input.format],
    counts: {
      version: 1,
      tool: 'create_spreadsheet',
      kind: 'spreadsheet',
      format: input.format,
      sheets: input.sheets.length,
      rows: input.rowCount,
    },
  };
}
