export type GeneratedFileLimits = {
  maxSheets: number;
  maxRows: number;
  maxBytes: number;
  maxColumns: number;
  maxSlides: number;
  maxBlocks: number;
  maxListItems: number;
  maxTableRows: number;
  maxStyleRules: number;
  maxConditionalFormats: number;
  maxStyledCells: number;
  maxCellCharacters: number;
  maxImageBytes: number;
};

/** Conservative defaults for model-generated office files. */
export const DEFAULT_GENERATED_FILE_LIMITS: GeneratedFileLimits = {
  maxSheets: 20,
  maxRows: 20_000,
  maxBytes: 5_242_880,
  maxColumns: 100,
  maxSlides: 100,
  maxBlocks: 2_000,
  maxListItems: 200,
  maxTableRows: 500,
  maxStyleRules: 200,
  maxConditionalFormats: 100,
  maxStyledCells: 10_000,
  maxCellCharacters: 32_767,
  maxImageBytes: 2_097_152,
};

function readPositiveInteger(value: string | undefined, fallback: number): number {
  if (value == null || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/** Reads the deployment limits once per call so tests and operators can override them. */
export function getGeneratedFileLimits(
  env: Record<string, string | undefined> = process.env,
): GeneratedFileLimits {
  return {
    maxSheets: readPositiveInteger(
      env.FILE_TOOL_MAX_SHEETS,
      DEFAULT_GENERATED_FILE_LIMITS.maxSheets,
    ),
    maxRows: readPositiveInteger(env.FILE_TOOL_MAX_ROWS, DEFAULT_GENERATED_FILE_LIMITS.maxRows),
    maxBytes: readPositiveInteger(env.FILE_TOOL_MAX_BYTES, DEFAULT_GENERATED_FILE_LIMITS.maxBytes),
    maxColumns: readPositiveInteger(
      env.FILE_TOOL_MAX_COLUMNS,
      DEFAULT_GENERATED_FILE_LIMITS.maxColumns,
    ),
    maxSlides: readPositiveInteger(
      env.FILE_TOOL_MAX_SLIDES,
      DEFAULT_GENERATED_FILE_LIMITS.maxSlides,
    ),
    maxBlocks: readPositiveInteger(
      env.FILE_TOOL_MAX_BLOCKS,
      DEFAULT_GENERATED_FILE_LIMITS.maxBlocks,
    ),
    maxListItems: readPositiveInteger(
      env.FILE_TOOL_MAX_LIST_ITEMS,
      DEFAULT_GENERATED_FILE_LIMITS.maxListItems,
    ),
    maxTableRows: readPositiveInteger(
      env.FILE_TOOL_MAX_TABLE_ROWS,
      DEFAULT_GENERATED_FILE_LIMITS.maxTableRows,
    ),
    maxStyleRules: readPositiveInteger(
      env.FILE_TOOL_MAX_STYLE_RULES,
      DEFAULT_GENERATED_FILE_LIMITS.maxStyleRules,
    ),
    maxConditionalFormats: readPositiveInteger(
      env.FILE_TOOL_MAX_CONDITIONAL_FORMATS,
      DEFAULT_GENERATED_FILE_LIMITS.maxConditionalFormats,
    ),
    maxStyledCells: readPositiveInteger(
      env.FILE_TOOL_MAX_STYLED_CELLS,
      DEFAULT_GENERATED_FILE_LIMITS.maxStyledCells,
    ),
    maxCellCharacters: readPositiveInteger(
      env.FILE_TOOL_MAX_CELL_CHARACTERS,
      DEFAULT_GENERATED_FILE_LIMITS.maxCellCharacters,
    ),
    maxImageBytes: readPositiveInteger(
      env.FILE_TOOL_MAX_IMAGE_BYTES,
      DEFAULT_GENERATED_FILE_LIMITS.maxImageBytes,
    ),
  };
}
