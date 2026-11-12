import ExcelJS from 'exceljs';
import type {
  TSpreadsheetPreview,
  TSpreadsheetPreviewCellStyle,
  TSpreadsheetPreviewColumn,
  TSpreadsheetPreviewSheet,
} from 'librechat-data-provider';

export const DEFAULT_PREVIEW_ROW_LIMIT: number = 500;
export const MAX_PREVIEW_ROW_LIMIT: number = 1_000;
export const DEFAULT_PREVIEW_CACHE_BYTES: number = 67_108_864;
const DEFAULT_MAX_SHEETS = 20;
const DEFAULT_MAX_ROWS = 20_000;
const DEFAULT_MAX_COLUMNS = 100;

export class SpreadsheetPreviewError extends Error {
  constructor(
    readonly code: 'unsupported' | 'sheet-out-of-range' | 'parse-failed' | 'size-limit',
    message: string,
  ) {
    super(message);
    this.name = 'SpreadsheetPreviewError';
  }
}

type ParsedSheet = {
  name: string;
  columns: TSpreadsheetPreviewColumn[];
  rows: unknown[][];
  totalRows: number;
  frozenRows: number;
  autoFilter?: string;
  styles: Record<string, TSpreadsheetPreviewCellStyle>;
};

type ParsedWorkbook = {
  sheets: ParsedSheet[];
  totalRows: number;
};

type CacheEntry = {
  key: string;
  value: ParsedWorkbook;
  size: number;
  usedAt: number;
};

class PreviewCache {
  private entries = new Map<string, CacheEntry>();
  private bytes = 0;

  constructor(private readonly maxBytes: number = DEFAULT_PREVIEW_CACHE_BYTES) {}

  get(key: string): ParsedWorkbook | undefined {
    const entry = this.entries.get(key);
    if (entry == null) {
      return undefined;
    }
    entry.usedAt = Date.now();
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: ParsedWorkbook, size: number): void {
    const existing = this.entries.get(key);
    if (existing != null) {
      this.bytes -= existing.size;
      this.entries.delete(key);
    }
    this.entries.set(key, { key, value, size, usedAt: Date.now() });
    this.bytes += size;
    while (this.bytes > this.maxBytes && this.entries.size > 1) {
      const oldestKey = this.entries.keys().next().value as string | undefined;
      if (oldestKey == null) {
        break;
      }
      const oldest = this.entries.get(oldestKey);
      if (oldest != null) {
        this.bytes -= oldest.size;
        this.entries.delete(oldestKey);
      }
    }
  }

  clear(): void {
    this.entries.clear();
    this.bytes = 0;
  }
}

const previewCache = new PreviewCache();

export function clearSpreadsheetPreviewCache(): void {
  previewCache.clear();
}

type ParsedRow = ExcelJS.Row;
type ParsedCell = ExcelJS.Cell;

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

function cellReference(row: number, column: number): string {
  return `${columnLetter(column)}${row}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function cellValueToJson(value: ExcelJS.CellValue): unknown {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value !== 'object') {
    return value;
  }
  if (isRecord(value) && 'richText' in value && Array.isArray(value.richText)) {
    return value.richText
      .map((part) => (isRecord(part) && typeof part.text === 'string' ? part.text : ''))
      .join('');
  }
  if (isRecord(value) && ('formula' in value || 'sharedFormula' in value)) {
    const formula = value.formula ?? value.sharedFormula;
    const result = value.result;
    if (result != null && !isRecord(result)) {
      return result;
    }
    return typeof formula === 'string' ? `=${formula}` : null;
  }
  if (isRecord(value) && 'text' in value && typeof value.text === 'string') {
    return value.text;
  }
  if (isRecord(value) && 'error' in value) {
    return String(value.error);
  }
  return null;
}

function readStyle(cell: ParsedCell): TSpreadsheetPreviewCellStyle | null {
  const style: TSpreadsheetPreviewCellStyle = {};
  const fill = cell.fill;
  if (
    fill != null &&
    fill.type === 'pattern' &&
    isRecord(fill.fgColor) &&
    typeof fill.fgColor.argb === 'string'
  ) {
    style.fill = `#${fill.fgColor.argb.slice(-6)}`;
  }
  const font = cell.font;
  if (font != null) {
    const color = font.color;
    if (isRecord(color) && typeof color.argb === 'string') {
      style.fontColor = `#${color.argb.slice(-6)}`;
    }
    if (font.bold === true) {
      style.bold = true;
    }
    if (font.italic === true) {
      style.italic = true;
    }
  }
  if (typeof cell.numFmt === 'string' && cell.numFmt.length > 0) {
    style.numFmt = cell.numFmt;
  }
  const horizontal = cell.alignment?.horizontal;
  if (horizontal === 'left' || horizontal === 'center' || horizontal === 'right') {
    style.align = horizontal;
  }
  return Object.keys(style).length > 0 ? style : null;
}

function autoFilterRange(worksheet: ExcelJS.Worksheet): string | undefined {
  const filter = worksheet.autoFilter;
  if (typeof filter === 'string') {
    return filter;
  }
  if (isRecord(filter) && isRecord(filter.from) && isRecord(filter.to)) {
    const from = filter.from;
    const to = filter.to;
    if (
      typeof from.row === 'number' &&
      typeof from.column === 'number' &&
      typeof to.row === 'number' &&
      typeof to.column === 'number'
    ) {
      return `${cellReference(from.row, from.column)}:${cellReference(to.row, to.column)}`;
    }
  }
  return undefined;
}

function parseWorksheet(
  worksheet: ExcelJS.Worksheet,
  maxRows: number,
  maxColumns: number,
): ParsedSheet {
  const rowCount = Math.max(
    1,
    Math.min(worksheet.actualRowCount || worksheet.rowCount, maxRows + 1),
  );
  const columnCount = Math.max(
    1,
    Math.min(worksheet.actualColumnCount || worksheet.columnCount, maxColumns),
  );
  const columns: TSpreadsheetPreviewColumn[] = [];
  const headerRow = worksheet.getRow(1);
  for (let column = 1; column <= columnCount; column++) {
    const headerCell = headerRow.getCell(column);
    const headerValue = cellValueToJson(headerCell.value);
    const header =
      typeof headerValue === 'string' && headerValue.trim().length > 0
        ? headerValue.trim()
        : columnLetter(column);
    const width = worksheet.getColumn(column).width;
    columns.push({
      header,
      ...(typeof width === 'number' && width > 0 ? { width } : {}),
    });
  }

  const rows: unknown[][] = [];
  const styles: Record<string, TSpreadsheetPreviewCellStyle> = {};
  for (let rowIndex = 2; rowIndex <= rowCount; rowIndex++) {
    const row: ParsedRow = worksheet.getRow(rowIndex);
    const values: unknown[] = [];
    for (let column = 1; column <= columnCount; column++) {
      const cell = row.getCell(column);
      values.push(cellValueToJson(cell.value));
      const style = readStyle(cell);
      if (style != null) {
        styles[cellReference(rowIndex, column)] = style;
      }
    }
    rows.push(values);
  }

  const frozenView = (worksheet.views ?? []).find(
    (view): view is ExcelJS.WorksheetViewFrozen =>
      view.state === 'frozen' && typeof view.ySplit === 'number',
  );

  return {
    name: worksheet.name,
    columns,
    rows,
    totalRows: rows.length,
    frozenRows: frozenView?.ySplit ?? 0,
    autoFilter: autoFilterRange(worksheet),
    styles,
  };
}

function parseCsv(text: string, maxRows: number, maxColumns: number): ParsedSheet {
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let index = 0; index < clean.length; index++) {
    const character = clean[index];
    if (inQuotes) {
      if (character === '"') {
        if (clean[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"') {
      inQuotes = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && clean[index + 1] === '\n') {
        index += 1;
      }
      row.push(field);
      field = '';
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
        if (rows.length >= maxRows + 1) {
          break;
        }
      }
      row = [];
    } else {
      field += character;
    }
  }
  if (row.length > 0 || field.length > 0) {
    row.push(field);
    if (row.some((value) => value.length > 0)) {
      rows.push(row);
    }
  }

  const header = rows[0] ?? [];
  const columnCount = Math.max(1, Math.min(header.length, maxColumns));
  const columns: TSpreadsheetPreviewColumn[] = [];
  for (let column = 0; column < columnCount; column++) {
    columns.push({
      header: header[column]?.trim() || columnLetter(column + 1),
    });
  }
  const body = rows.slice(1).map((values) => {
    const cells: unknown[] = [];
    for (let column = 0; column < columnCount; column++) {
      const value = values[column] ?? null;
      cells.push(value === '' ? null : value);
    }
    return cells;
  });
  return {
    name: 'Sheet1',
    columns,
    rows: body,
    totalRows: body.length,
    frozenRows: 1,
    autoFilter: `A1:${columnLetter(columnCount)}1`,
    styles: {},
  };
}

function isSpreadsheet(filename: string, mimeType: string): 'xlsx' | 'csv' | null {
  const extension = filename.toLowerCase().split('.').pop();
  if (extension === 'xlsx' || mimeType.includes('spreadsheetml.sheet')) {
    return 'xlsx';
  }
  if (extension === 'csv' || mimeType.includes('text/csv')) {
    return 'csv';
  }
  return null;
}

function cacheKey(fileId: string, updatedAt: string | Date | undefined, buffer: Buffer): string {
  return `${fileId}:${updatedAt != null ? String(updatedAt) : 'unknown'}:${buffer.length}`;
}

export type GetSpreadsheetPreviewParams = {
  fileId: string;
  filename: string;
  mimeType: string;
  updatedAt?: string | Date;
  buffer: Buffer;
  sheet?: number;
  offset?: number;
  limit?: number;
  maxRows?: number;
  maxColumns?: number;
  maxSheets?: number;
};

function parseQueryInteger(value: number | undefined, fallback: number, min: number): number {
  if (value == null || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.floor(value));
}

function selectSheet(workbook: ParsedWorkbook, index: number, maxSheets: number): ParsedSheet {
  if (index < 0 || index >= workbook.sheets.length || index >= maxSheets) {
    throw new SpreadsheetPreviewError('sheet-out-of-range', 'The requested sheet does not exist');
  }
  return workbook.sheets[index];
}

function toPreviewSheet(
  sheet: ParsedSheet,
  index: number,
  offset: number,
  limit: number,
): TSpreadsheetPreviewSheet {
  const pageRows = sheet.rows.slice(offset, offset + limit);
  const pageStart = offset + 2;
  const pageEnd = pageStart + pageRows.length;
  const styles: Record<string, TSpreadsheetPreviewCellStyle> = {};
  for (const [reference, style] of Object.entries(sheet.styles)) {
    const match = /^([A-Z]+)(\d+)$/.exec(reference);
    if (match == null) {
      continue;
    }
    const row = Number(match[2]);
    if (row >= pageStart && row < pageEnd) {
      styles[reference] = style;
    }
  }
  return {
    name: sheet.name,
    index,
    columns: sheet.columns,
    rows: pageRows,
    totalRows: sheet.totalRows,
    offset,
    limit,
    frozenRows: sheet.frozenRows,
    ...(sheet.autoFilter != null ? { autoFilter: sheet.autoFilter } : {}),
    ...(Object.keys(styles).length > 0 ? { styles } : {}),
  };
}

/**
 * Parses a generated xlsx/csv file into a bounded, pageable preview.
 *
 * The parsed workbook is cached by file identity and revision so sheet tabs and
 * scroll pages do not re-read or re-parse the file. A cache miss parses the
 * complete sheet set once, then every page is a slice.
 */
export async function getSpreadsheetPreview(
  params: GetSpreadsheetPreviewParams,
): Promise<TSpreadsheetPreview> {
  const format = isSpreadsheet(params.filename, params.mimeType);
  if (format == null) {
    throw new SpreadsheetPreviewError('unsupported', 'The file is not a spreadsheet');
  }
  if (params.buffer.length > 10 * 1024 * 1024) {
    throw new SpreadsheetPreviewError('size-limit', 'The spreadsheet is too large to preview');
  }

  const maxRows = params.maxRows ?? DEFAULT_MAX_ROWS;
  const maxColumns = params.maxColumns ?? DEFAULT_MAX_COLUMNS;
  const maxSheets = params.maxSheets ?? DEFAULT_MAX_SHEETS;
  const key = cacheKey(params.fileId, params.updatedAt, params.buffer);
  let parsed = previewCache.get(key);
  if (parsed == null) {
    try {
      if (format === 'csv') {
        const sheet = parseCsv(params.buffer.toString('utf8'), maxRows, maxColumns);
        parsed = { sheets: [sheet], totalRows: sheet.totalRows };
      } else {
        const workbook = new ExcelJS.Workbook();
        const data = params.buffer.buffer.slice(
          params.buffer.byteOffset,
          params.buffer.byteOffset + params.buffer.byteLength,
        ) as ArrayBuffer;
        await workbook.xlsx.load(data);
        const sheets = workbook.worksheets
          .slice(0, maxSheets)
          .map((worksheet) => parseWorksheet(worksheet, maxRows, maxColumns));
        parsed = {
          sheets,
          totalRows: sheets.reduce((sum, sheet) => sum + sheet.totalRows, 0),
        };
      }
    } catch (error) {
      if (error instanceof SpreadsheetPreviewError) {
        throw error;
      }
      throw new SpreadsheetPreviewError('parse-failed', 'The spreadsheet could not be parsed');
    }
    previewCache.set(key, parsed, Math.max(1_024, params.buffer.length * 3));
  }

  const requestedSheet = parseQueryInteger(params.sheet, 0, 0);
  const offset = parseQueryInteger(params.offset, 0, 0);
  const limit = Math.min(
    MAX_PREVIEW_ROW_LIMIT,
    parseQueryInteger(params.limit, DEFAULT_PREVIEW_ROW_LIMIT, 1),
  );
  const selected = selectSheet(parsed, requestedSheet, maxSheets);
  const sheets = parsed.sheets.map((sheet, index) =>
    index === requestedSheet
      ? toPreviewSheet(sheet, index, offset, limit)
      : {
          name: sheet.name,
          index,
          columns: sheet.columns,
          rows: [],
          totalRows: sheet.totalRows,
          offset: 0,
          limit,
          frozenRows: sheet.frozenRows,
          ...(sheet.autoFilter != null ? { autoFilter: sheet.autoFilter } : {}),
        },
  );

  return {
    sheets,
    totalSheets: parsed.sheets.length,
    totalRows: parsed.totalRows,
    truncated: selected.totalRows > offset + limit,
  };
}
