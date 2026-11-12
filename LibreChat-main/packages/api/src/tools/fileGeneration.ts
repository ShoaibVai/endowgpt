import { DynamicStructuredTool } from '@librechat/agents/langchain/tools';
import type { TFile } from 'librechat-data-provider';
import type { GeneratedFileCounts, RenderedGeneratedFile } from '~/files/generated/types';
import type { GeneratedFileLimits } from '~/files/generated/limits';
import {
  documentInputSchema,
  normalizeDocumentInput,
  normalizePresentationInput,
  normalizeSpreadsheetInput,
  presentationInputSchema,
  spreadsheetInputSchema,
} from '~/files/generated/schema';
import {
  CREATE_DOCUMENT_TOOL,
  CREATE_PRESENTATION_TOOL,
  CREATE_SPREADSHEET_TOOL,
  DOCUMENT_DESCRIPTION,
  PRESENTATION_DESCRIPTION,
  SPREADSHEET_DESCRIPTION,
} from './fileGenerationDefs';
import { renderPresentation } from '~/files/generated/presentation';
import { renderSpreadsheet } from '~/files/generated/spreadsheet';
import { renderDocument } from '~/files/generated/document';

export {
  CREATE_DOCUMENT_TOOL,
  CREATE_PRESENTATION_TOOL,
  CREATE_SPREADSHEET_TOOL,
  DOCUMENT_DESCRIPTION,
  FILE_GENERATION_ARTIFACT_KEY,
  FILE_GENERATION_TOOL_NAMES,
  PRESENTATION_DESCRIPTION,
  SPREADSHEET_DESCRIPTION,
  fileGenerationToolDefinitions,
  getFileGenerationCatalogTools,
} from './fileGenerationDefs';

export type PersistGeneratedFile = (
  file: RenderedGeneratedFile & {
    conversationId?: string;
    messageId?: string;
  },
) => Promise<TFile>;

export type FileGenerationToolOptions = {
  limits: GeneratedFileLimits;
  persist: PersistGeneratedFile;
  /** Throws when this user has exhausted the file-generation window. */
  rateLimit?: () => Promise<void>;
  logger?: {
    error: (message: string, error?: unknown) => void;
  };
};

type ToolConfig = {
  metadata?: Record<string, unknown>;
};

function readMetadataString(config: unknown, key: string): string | undefined {
  if (typeof config !== 'object' || config === null) {
    return undefined;
  }
  const metadata = (config as ToolConfig).metadata;
  if (typeof metadata !== 'object' || metadata === null) {
    return undefined;
  }
  const value = metadata[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function plural(count: number | undefined, singular: string): string {
  const value = count ?? 0;
  return `${value} ${singular}${value === 1 ? '' : 's'}`;
}

function summary(counts: GeneratedFileCounts): string {
  let detail: string;
  if (counts.kind === 'spreadsheet') {
    detail = `${plural(counts.sheets, 'sheet')}, ${plural(counts.rows, 'row')}`;
  } else if (counts.kind === 'presentation') {
    detail = plural(counts.slides, 'slide');
  } else {
    detail = plural(counts.blocks, 'block');
  }
  return `Created the ${counts.kind} (${detail}).`;
}

function errorMessage(tool: string, error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return `Could not create the file with ${tool}: ${error.message}`;
  }
  return `Could not create the file with ${tool}. Please simplify the request and try again.`;
}

function createTool({
  name,
  description,
  schema,
  run,
  rateLimit,
  logger,
}: {
  name: string;
  description: string;
  schema:
    | typeof spreadsheetInputSchema
    | typeof documentInputSchema
    | typeof presentationInputSchema;
  run: (input: unknown, config: unknown) => Promise<[string, { generatedFile: TFile } | null]>;
  rateLimit?: () => Promise<void>;
  logger?: FileGenerationToolOptions['logger'];
}): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name,
    description,
    schema,
    responseFormat: 'content_and_artifact',
    func: async (input, _runManager, config) => {
      try {
        await rateLimit?.();
        return await run(input, config);
      } catch (error) {
        logger?.error(`[${name}] Failed to create file`, error);
        return [errorMessage(name, error), null];
      }
    },
  });
}

export function createSpreadsheetTool({
  limits,
  persist,
  rateLimit,
  logger,
}: FileGenerationToolOptions): DynamicStructuredTool {
  return createTool({
    name: CREATE_SPREADSHEET_TOOL,
    description: SPREADSHEET_DESCRIPTION,
    schema: spreadsheetInputSchema,
    rateLimit,
    logger,
    run: async (input, config) => {
      const normalized = normalizeSpreadsheetInput(
        input as Parameters<typeof normalizeSpreadsheetInput>[0],
        limits,
      );
      const rendered = await renderSpreadsheet(normalized, limits);
      const file = await persist({
        ...rendered,
        conversationId: readMetadataString(config, 'thread_id'),
        messageId: readMetadataString(config, 'run_id'),
      });
      return [summary(rendered.counts), { generatedFile: file }];
    },
  });
}

export function createDocumentTool({
  limits,
  persist,
  rateLimit,
  logger,
}: FileGenerationToolOptions): DynamicStructuredTool {
  return createTool({
    name: CREATE_DOCUMENT_TOOL,
    description: DOCUMENT_DESCRIPTION,
    schema: documentInputSchema,
    rateLimit,
    logger,
    run: async (input, config) => {
      const normalized = normalizeDocumentInput(
        input as Parameters<typeof normalizeDocumentInput>[0],
        limits,
      );
      const rendered = await renderDocument(normalized, limits);
      const file = await persist({
        ...rendered,
        conversationId: readMetadataString(config, 'thread_id'),
        messageId: readMetadataString(config, 'run_id'),
      });
      return [summary(rendered.counts), { generatedFile: file }];
    },
  });
}

export function createPresentationTool({
  limits,
  persist,
  rateLimit,
  logger,
}: FileGenerationToolOptions): DynamicStructuredTool {
  return createTool({
    name: CREATE_PRESENTATION_TOOL,
    description: PRESENTATION_DESCRIPTION,
    schema: presentationInputSchema,
    rateLimit,
    logger,
    run: async (input, config) => {
      const normalized = normalizePresentationInput(
        input as Parameters<typeof normalizePresentationInput>[0],
        limits,
      );
      const rendered = await renderPresentation(normalized, limits);
      const file = await persist({
        ...rendered,
        conversationId: readMetadataString(config, 'thread_id'),
        messageId: readMetadataString(config, 'run_id'),
      });
      return [summary(rendered.counts), { generatedFile: file }];
    },
  });
}

export function createFileGenerationTools(
  options: FileGenerationToolOptions,
): DynamicStructuredTool[] {
  return [
    createSpreadsheetTool(options),
    createDocumentTool(options),
    createPresentationTool(options),
  ];
}
