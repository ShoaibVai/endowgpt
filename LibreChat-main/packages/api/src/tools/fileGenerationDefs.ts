import type { ToolRegistryDefinition } from './registry/definitions';
import type { ExtendedJsonSchema } from './registry/schema';
import {
  documentInputSchema,
  presentationInputSchema,
  spreadsheetInputSchema,
} from '~/files/generated/schema';
import { toToolParameters } from './schema';

export const CREATE_SPREADSHEET_TOOL = 'create_spreadsheet';
export const CREATE_DOCUMENT_TOOL = 'create_document';
export const CREATE_PRESENTATION_TOOL = 'create_presentation';

export const FILE_GENERATION_TOOL_NAMES: readonly string[] = [
  CREATE_SPREADSHEET_TOOL,
  CREATE_DOCUMENT_TOOL,
  CREATE_PRESENTATION_TOOL,
];

export const FILE_GENERATION_ARTIFACT_KEY = '__librechat_generated_file';

export const SPREADSHEET_DESCRIPTION =
  'Create a real downloadable spreadsheet (.xlsx or .csv). Use this whenever the user asks for an Excel file, spreadsheet, table download, or data export. Do not write HTML, React, or code artifacts to build a spreadsheet in the browser. Provide one or more sheets with simple columns and rows: rows may be arrays aligned to columns or objects keyed by column key/header. Header styling, column widths, a frozen header, and filters are applied automatically. Formulas are allowed as strings beginning with "="; they are written to the file, never evaluated on the server.';

export const DOCUMENT_DESCRIPTION =
  'Create a real downloadable document (.docx or .md). Use this whenever the user asks for a Word document, report, memo, letter, or Markdown file. Do not write HTML or React artifacts to fake a document. Provide an ordered list of blocks: heading, paragraph, list, table, or pagebreak. Word output receives professional heading, paragraph, table, and page styles automatically.';

export const PRESENTATION_DESCRIPTION =
  'Create a real downloadable PowerPoint presentation (.pptx). Use this whenever the user asks for slides, a deck, or a presentation file. Do not write HTML or React artifacts to fake slides. Provide slides with a title and optional bullets, speaker notes, and a PNG/JPEG data URL image. A clean title, accent line, footer, and typography are applied automatically.';

function providerSchema(schema: object): ExtendedJsonSchema {
  const { $schema: _schema, ...rest } = schema as Record<string, unknown>;
  return rest as ExtendedJsonSchema;
}

function definition(name: string, description: string, schema: object): ToolRegistryDefinition {
  return {
    name,
    description,
    schema: providerSchema(schema),
    responseFormat: 'content_and_artifact',
    toolType: 'builtin',
  };
}

export const fileGenerationToolDefinitions: Record<string, ToolRegistryDefinition> = {
  [CREATE_SPREADSHEET_TOOL]: definition(
    CREATE_SPREADSHEET_TOOL,
    SPREADSHEET_DESCRIPTION,
    toToolParameters(spreadsheetInputSchema) ?? {},
  ),
  [CREATE_DOCUMENT_TOOL]: definition(
    CREATE_DOCUMENT_TOOL,
    DOCUMENT_DESCRIPTION,
    toToolParameters(documentInputSchema) ?? {},
  ),
  [CREATE_PRESENTATION_TOOL]: definition(
    CREATE_PRESENTATION_TOOL,
    PRESENTATION_DESCRIPTION,
    toToolParameters(presentationInputSchema) ?? {},
  ),
};

/** Plain catalog entries for the cached tool list; the runtime constructors need a request. */
export function getFileGenerationCatalogTools(): Array<{
  name: string;
  description: string;
  schema: object;
}> {
  return Object.values(fileGenerationToolDefinitions).map((entry) => ({
    name: entry.name,
    description: entry.description,
    schema: entry.schema,
  }));
}
