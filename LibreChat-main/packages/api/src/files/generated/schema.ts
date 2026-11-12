import { z } from 'zod';
import type { GeneratedFileLimits } from './limits';
import type {
  GeneratedDocumentFormat,
  GeneratedPresentationFormat,
  GeneratedSpreadsheetFormat,
} from './types';
import { sanitizeGeneratedFilename } from './filename';

export class GeneratedFileValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeneratedFileValidationError';
  }
}

const COLOR_PATTERN = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const CELL_REFERENCE_PATTERN = /^\$?([A-Z]{1,3})\$?(\d{1,7})$/i;
const SHEET_NAME_INVALID_CHARACTERS = /[[\]:*?/\\]/g;
const SAFE_COLUMN_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,99}$/;

export type SpreadsheetColumnInput = {
  header: string;
  key?: string;
  width?: number;
  type?: 'string' | 'number' | 'date' | 'boolean' | 'currency' | 'percent';
  format?: string;
};

export type SpreadsheetCellStyleInput = {
  range: string;
  fill?: string;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
};

export type SpreadsheetConditionalFormatInput = {
  range: string;
  rule: 'greaterThan' | 'lessThan' | 'between' | 'equal' | 'containsText';
  value?: string | number;
  values?: Array<string | number>;
  style: Omit<SpreadsheetCellStyleInput, 'range'>;
};

export type SpreadsheetSheetInput = {
  name: string;
  columns: SpreadsheetColumnInput[];
  rows: unknown[];
  freezeHeader?: boolean;
  autoFilter?: boolean;
  cellStyles?: SpreadsheetCellStyleInput[];
  conditionalFormats?: SpreadsheetConditionalFormatInput[];
};

export type SpreadsheetInput = {
  filename: string;
  sheets: SpreadsheetSheetInput[];
};

export type DocumentBlockInput = {
  type: 'heading' | 'paragraph' | 'list' | 'table' | 'pagebreak';
  text?: string;
  level?: number;
  items?: string[];
  ordered?: boolean;
  headers?: string[];
  rows?: unknown[][];
};

export type DocumentInput = {
  filename: string;
  blocks: DocumentBlockInput[];
};

export type PresentationSlideInput = {
  title: string;
  bullets?: string[];
  notes?: string;
  image?: string;
};

export type PresentationInput = {
  filename: string;
  slides: PresentationSlideInput[];
};

const columnSchema = z.object({
  header: z.string().min(1).max(200),
  key: z.string().min(1).max(100).optional(),
  width: z.number().min(4).max(80).optional(),
  type: z.enum(['string', 'number', 'date', 'boolean', 'currency', 'percent']).optional(),
  format: z.string().min(1).max(100).optional(),
});

const cellStyleSchema = z.object({
  range: z.string().min(1).max(40),
  fill: z.string().regex(COLOR_PATTERN).optional(),
  fontColor: z.string().regex(COLOR_PATTERN).optional(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  align: z.enum(['left', 'center', 'right']).optional(),
});

const conditionalFormatSchema = z.object({
  range: z.string().min(1).max(40),
  rule: z.enum(['greaterThan', 'lessThan', 'between', 'equal', 'containsText']),
  value: z.union([z.string().max(500), z.number()]).optional(),
  values: z
    .array(z.union([z.string().max(500), z.number()]))
    .max(2)
    .optional(),
  style: cellStyleSchema.omit({ range: true }),
});

const sheetSchema = z.object({
  name: z.string().min(1).max(80),
  columns: z.array(columnSchema).min(1),
  rows: z.array(z.unknown()),
  freezeHeader: z.boolean().optional(),
  autoFilter: z.boolean().optional(),
  cellStyles: z.array(cellStyleSchema).optional(),
  conditionalFormats: z.array(conditionalFormatSchema).optional(),
});

export const spreadsheetInputSchema: z.ZodType<SpreadsheetInput> = z.object({
  filename: z.string().min(1).max(200),
  sheets: z.array(sheetSchema).min(1),
}) as unknown as z.ZodType<SpreadsheetInput>;

const documentBlockSchema = z.object({
  type: z.enum(['heading', 'paragraph', 'list', 'table', 'pagebreak']),
  text: z.string().max(20_000).optional(),
  level: z.number().int().min(1).max(3).optional(),
  items: z.array(z.string().max(5_000)).optional(),
  ordered: z.boolean().optional(),
  headers: z.array(z.string().max(200)).optional(),
  rows: z.array(z.array(z.unknown())).optional(),
});

export const documentInputSchema: z.ZodType<DocumentInput> = z.object({
  filename: z.string().min(1).max(200),
  blocks: z.array(documentBlockSchema).min(1),
}) as unknown as z.ZodType<DocumentInput>;

const slideSchema = z.object({
  title: z.string().min(1).max(200),
  bullets: z.array(z.string().max(1_000)).optional(),
  notes: z.string().max(5_000).optional(),
  image: z.string().max(3_000_000).optional(),
});

export const presentationInputSchema: z.ZodType<PresentationInput> = z.object({
  filename: z.string().min(1).max(200),
  slides: z.array(slideSchema).min(1),
}) as unknown as z.ZodType<PresentationInput>;

export type CellRange = {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
};

export type NormalizedCellStyle = {
  range: string;
  cells: CellRange;
  fill?: string;
  fontColor?: string;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
};

export type NormalizedConditionalFormat = {
  range: string;
  cells: CellRange;
  rule: 'greaterThan' | 'lessThan' | 'between' | 'equal' | 'containsText';
  value?: string | number;
  values?: Array<string | number>;
  style: Omit<NormalizedCellStyle, 'range' | 'cells'>;
};

export type NormalizedSpreadsheetColumn = {
  header: string;
  key: string;
  width?: number;
  type?: 'string' | 'number' | 'date' | 'boolean' | 'currency' | 'percent';
  format?: string;
};

export type NormalizedSpreadsheetSheet = {
  name: string;
  columns: NormalizedSpreadsheetColumn[];
  rows: Array<Array<string | number | boolean | null>>;
  freezeHeader: boolean;
  autoFilter: boolean;
  cellStyles: NormalizedCellStyle[];
  conditionalFormats: NormalizedConditionalFormat[];
};

export type NormalizedSpreadsheetInput = {
  filename: string;
  format: GeneratedSpreadsheetFormat;
  sheets: NormalizedSpreadsheetSheet[];
  rowCount: number;
};

export type NormalizedDocumentBlock =
  | { type: 'heading'; text: string; level: 1 | 2 | 3 }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[]; ordered: boolean }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'pagebreak' };

export type NormalizedDocumentInput = {
  filename: string;
  format: GeneratedDocumentFormat;
  blocks: NormalizedDocumentBlock[];
};

export type NormalizedPresentationSlide = {
  title: string;
  bullets: string[];
  notes?: string;
  image?: string;
};

export type NormalizedPresentationInput = {
  filename: string;
  format: GeneratedPresentationFormat;
  slides: NormalizedPresentationSlide[];
};

type PrimitiveCell = string | number | boolean | null;

function fail(message: string): never {
  throw new GeneratedFileValidationError(message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function columnNumber(letters: string): number {
  let result = 0;
  const upper = letters.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    const code = upper.charCodeAt(i) - 64;
    if (code < 1 || code > 26) {
      fail(`Invalid column reference "${letters}"`);
    }
    result = result * 26 + code;
  }
  return result;
}

function parseCellReference(reference: string): { row: number; column: number } {
  const match = CELL_REFERENCE_PATTERN.exec(reference.trim());
  if (match == null) {
    fail(`Invalid cell reference "${reference}"`);
  }
  return {
    column: columnNumber(match[1]),
    row: Number(match[2]),
  };
}

export function parseCellRange(range: string, limits: GeneratedFileLimits): CellRange {
  const parts = String(range).trim().split(':');
  if (parts.length === 0 || parts.length > 2 || parts.some((part) => part.trim() === '')) {
    fail(`Invalid cell range "${range}"`);
  }
  const start = parseCellReference(parts[0]);
  const end = parts.length === 1 ? start : parseCellReference(parts[1]);
  if (end.row < start.row || end.column < start.column) {
    fail(`Cell range "${range}" must run from top-left to bottom-right`);
  }
  if (end.column > limits.maxColumns || end.row > limits.maxRows + 1) {
    fail(`Cell range "${range}" exceeds the configured spreadsheet bounds`);
  }
  const cells = (end.row - start.row + 1) * (end.column - start.column + 1);
  if (cells > limits.maxStyledCells) {
    fail(`Cell range "${range}" is too large to style`);
  }
  return {
    startRow: start.row,
    startColumn: start.column,
    endRow: end.row,
    endColumn: end.column,
  };
}

export function normalizeColor(value: string, field: string): string {
  const trimmed = value.trim();
  if (!COLOR_PATTERN.test(trimmed)) {
    fail(`${field} must be a 3, 6, or 8 digit hex color`);
  }
  let hex = trimmed.replace(/^#/, '').toUpperCase();
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((character) => character + character)
      .join('');
  }
  if (hex.length === 6) {
    hex = `FF${hex}`;
  }
  return hex;
}

function normalizeCellValue(
  value: unknown,
  column: string,
  limits: GeneratedFileLimits,
): PrimitiveCell {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string') {
    if (value.length > limits.maxCellCharacters) {
      fail(`Cell in "${column}" exceeds the ${limits.maxCellCharacters} character limit`);
    }
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      fail(`Cell in "${column}" must be a finite number`);
    }
    return value;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  fail(`Cell in "${column}" must be a string, number, boolean, or null`);
}

function normalizeRow(
  row: unknown,
  columns: NormalizedSpreadsheetColumn[],
  rowIndex: number,
  limits: GeneratedFileLimits,
): PrimitiveCell[] {
  if (Array.isArray(row)) {
    const values = row.slice(0, columns.length);
    while (values.length < columns.length) {
      values.push(null);
    }
    return values.map((value, columnIndex) =>
      normalizeCellValue(value, columns[columnIndex].header, limits),
    );
  }
  if (isPlainObject(row)) {
    return columns.map((column) => {
      const hasKey = Object.prototype.hasOwnProperty.call(row, column.key);
      const hasHeader = Object.prototype.hasOwnProperty.call(row, column.header);
      let value: unknown = null;
      if (hasKey) {
        value = row[column.key];
      } else if (hasHeader) {
        value = row[column.header];
      }
      return normalizeCellValue(value, column.header, limits);
    });
  }
  fail(`Row ${rowIndex + 1} must be an array or an object keyed by column`);
}

function normalizeSheetName(value: string, index: number, used: Set<string>): string {
  const cleaned = value
    .replace(SHEET_NAME_INVALID_CHARACTERS, '_')
    .replace(/^'+|'+$/g, '')
    .trim();
  let name = cleaned.slice(0, 31) || `Sheet${index + 1}`;
  let suffix = 2;
  while (used.has(name.toLowerCase())) {
    const suffixText = ` (${suffix})`;
    name = `${cleaned.slice(0, Math.max(1, 31 - suffixText.length)) || `Sheet${index + 1}`}${suffixText}`;
    suffix += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

function normalizeColumnKey(value: string, columnIndex: number, used: Set<string>): string {
  let key = SAFE_COLUMN_KEY.test(value) ? value : `column_${columnIndex + 1}`;
  let suffix = 2;
  while (used.has(key)) {
    key = `${key}_${suffix}`;
    suffix += 1;
  }
  used.add(key);
  return key;
}

function normalizeStyle(
  style: z.infer<typeof cellStyleSchema>,
  limits: GeneratedFileLimits,
): NormalizedCellStyle {
  const cells = parseCellRange(style.range, limits);
  return {
    range: style.range,
    cells,
    fill: style.fill != null ? normalizeColor(style.fill, 'fill') : undefined,
    fontColor: style.fontColor != null ? normalizeColor(style.fontColor, 'fontColor') : undefined,
    bold: style.bold,
    italic: style.italic,
    align: style.align,
  };
}

function normalizeConditionalFormat(
  format: z.infer<typeof conditionalFormatSchema>,
  limits: GeneratedFileLimits,
): NormalizedConditionalFormat {
  const cells = parseCellRange(format.range, limits);
  if (format.rule === 'between') {
    if (format.values == null || format.values.length !== 2) {
      fail(`Conditional format "${format.rule}" needs exactly two values`);
    }
  } else if (format.rule === 'containsText') {
    if (typeof format.value !== 'string' || format.value.length === 0) {
      fail('Conditional format "containsText" needs a non-empty text value');
    }
  } else if (format.value == null) {
    fail(`Conditional format "${format.rule}" needs a value`);
  }
  return {
    range: format.range,
    cells,
    rule: format.rule,
    value: format.value,
    values: format.values,
    style: {
      fill: format.style.fill != null ? normalizeColor(format.style.fill, 'fill') : undefined,
      fontColor:
        format.style.fontColor != null
          ? normalizeColor(format.style.fontColor, 'fontColor')
          : undefined,
      bold: format.style.bold,
      italic: format.style.italic,
      align: format.style.align,
    },
  };
}

export function normalizeSpreadsheetInput(
  input: SpreadsheetInput,
  limits: GeneratedFileLimits,
): NormalizedSpreadsheetInput {
  const { filename, format } = sanitizeGeneratedFilename(input.filename, ['xlsx', 'csv'], 'xlsx');
  if (input.sheets.length > limits.maxSheets) {
    fail(`A workbook can contain at most ${limits.maxSheets} sheets`);
  }
  if (format === 'csv' && input.sheets.length > 1) {
    fail('CSV supports one sheet; use .xlsx for a multi-sheet workbook');
  }

  const usedSheetNames = new Set<string>();
  let totalRows = 0;
  const sheets = input.sheets.map((sheet, sheetIndex) => {
    if (sheet.columns.length > limits.maxColumns) {
      fail(`Sheet "${sheet.name}" exceeds the ${limits.maxColumns} column limit`);
    }
    const usedKeys = new Set<string>();
    const columns = sheet.columns.map((column, columnIndex) => {
      const header = column.header.trim();
      if (header.length === 0) {
        fail(`Sheet "${sheet.name}" has an empty column header`);
      }
      const key = normalizeColumnKey(column.key?.trim() || header, columnIndex, usedKeys);
      return {
        header,
        key,
        width: column.width,
        type: column.type,
        format: column.format,
      };
    });
    totalRows += sheet.rows.length;
    if (totalRows > limits.maxRows) {
      fail(`The workbook exceeds the ${limits.maxRows} total row limit`);
    }
    if ((sheet.cellStyles?.length ?? 0) > limits.maxStyleRules) {
      fail(`Sheet "${sheet.name}" has too many cell style rules`);
    }
    if ((sheet.conditionalFormats?.length ?? 0) > limits.maxConditionalFormats) {
      fail(`Sheet "${sheet.name}" has too many conditional format rules`);
    }
    return {
      name: normalizeSheetName(sheet.name, sheetIndex, usedSheetNames),
      columns,
      rows: sheet.rows.map((row, rowIndex) => normalizeRow(row, columns, rowIndex, limits)),
      freezeHeader: sheet.freezeHeader !== false,
      autoFilter: sheet.autoFilter !== false,
      cellStyles: (sheet.cellStyles ?? []).map((style) => normalizeStyle(style, limits)),
      conditionalFormats: (sheet.conditionalFormats ?? []).map((format) =>
        normalizeConditionalFormat(format, limits),
      ),
    };
  });

  return {
    filename,
    format,
    sheets,
    rowCount: totalRows,
  };
}

export function normalizeDocumentInput(
  input: DocumentInput,
  limits: GeneratedFileLimits,
): NormalizedDocumentInput {
  const { filename, format } = sanitizeGeneratedFilename(input.filename, ['docx', 'md'], 'docx');
  if (input.blocks.length > limits.maxBlocks) {
    fail(`A document can contain at most ${limits.maxBlocks} blocks`);
  }

  const blocks = input.blocks.map((block, index): NormalizedDocumentBlock => {
    if (block.type === 'pagebreak') {
      return { type: 'pagebreak' };
    }
    if (block.type === 'heading') {
      const text = block.text?.trim();
      if (!text) {
        fail(`Heading block ${index + 1} needs text`);
      }
      const level = block.level ?? 1;
      if (level < 1 || level > 3) {
        fail(`Heading block ${index + 1} level must be between 1 and 3`);
      }
      return { type: 'heading', text, level: level as 1 | 2 | 3 };
    }
    if (block.type === 'paragraph') {
      const text = block.text?.trim();
      if (!text) {
        fail(`Paragraph block ${index + 1} needs text`);
      }
      return { type: 'paragraph', text };
    }
    if (block.type === 'list') {
      if (block.items == null || block.items.length === 0) {
        fail(`List block ${index + 1} needs at least one item`);
      }
      if (block.items.length > limits.maxListItems) {
        fail(`List block ${index + 1} exceeds the ${limits.maxListItems} item limit`);
      }
      const items = block.items.map((item) => item.trim()).filter((item) => item.length > 0);
      if (items.length === 0) {
        fail(`List block ${index + 1} needs at least one non-empty item`);
      }
      return {
        type: 'list',
        items,
        ordered: block.ordered === true,
      };
    }
    if (block.headers == null || block.headers.length === 0) {
      fail(`Table block ${index + 1} needs headers`);
    }
    const headers = block.headers.map((header) => header.trim());
    if (headers.some((header) => header.length === 0)) {
      fail(`Table block ${index + 1} has an empty header`);
    }
    if ((block.rows?.length ?? 0) > limits.maxTableRows) {
      fail(`Table block ${index + 1} exceeds the ${limits.maxTableRows} row limit`);
    }
    const rows = (block.rows ?? []).map((row) =>
      headers.map((header, columnIndex) =>
        String(
          normalizeCellValue(row[columnIndex], `${headers[columnIndex] ?? header}`, limits) ?? '',
        ),
      ),
    );
    return { type: 'table', headers, rows };
  });

  return { filename, format, blocks };
}

function validateImageDataUrl(
  image: string,
  slideIndex: number,
  limits: GeneratedFileLimits,
): string {
  const match = /^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/=\s]+)$/i.exec(image.trim());
  if (match == null) {
    fail(`Slide ${slideIndex + 1} image must be a PNG or JPEG data URL`);
  }
  const bytes = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
  if (bytes.length > limits.maxImageBytes) {
    fail(`Slide ${slideIndex + 1} image exceeds the ${limits.maxImageBytes} byte limit`);
  }
  return `data:image/${match[1].toLowerCase().replace('jpg', 'jpeg')};base64,${match[2].replace(/\s/g, '')}`;
}

export function normalizePresentationInput(
  input: PresentationInput,
  limits: GeneratedFileLimits,
): NormalizedPresentationInput {
  const { filename, format } = sanitizeGeneratedFilename(input.filename, ['pptx'], 'pptx');
  if (input.slides.length > limits.maxSlides) {
    fail(`A presentation can contain at most ${limits.maxSlides} slides`);
  }
  const slides = input.slides.map((slide, index) => {
    if (slide.bullets != null && slide.bullets.length > 20) {
      fail(`Slide ${index + 1} has too many bullets`);
    }
    const title = slide.title.trim();
    if (title.length === 0) {
      fail(`Slide ${index + 1} needs a title`);
    }
    return {
      title,
      bullets: (slide.bullets ?? []).map((bullet) => bullet.trim()).filter(Boolean),
      notes: slide.notes?.trim() || undefined,
      image: slide.image != null ? validateImageDataUrl(slide.image, index, limits) : undefined,
    };
  });
  return { filename, format, slides };
}
