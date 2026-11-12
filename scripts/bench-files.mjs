#!/usr/bin/env node
/**
 * Native file-tool performance check.
 *
 *   node scripts/bench-files.mjs
 *
 * Uses the built @librechat/api package. Exits non-zero if the 1,000-row xlsx
 * render exceeds 500 ms or a cached preview page exceeds 300 ms.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const api = require(path.resolve('LibreChat-main/packages/api/dist/index.cjs'));

const limits = api.DEFAULT_GENERATED_FILE_LIMITS;
const rows = Array.from({ length: 1_000 }, (_, index) => [
  `Student ${index + 1}`,
  60 + (index % 40),
  index % 2 === 0,
]);

const normalizeStarted = Date.now();
const normalized = api.normalizeSpreadsheetInput(
  {
    filename: 'Students.xlsx',
    sheets: [
      {
        name: 'Students',
        columns: [
          { header: 'Name', width: 24 },
          { header: 'Grade', type: 'number' },
          { header: 'Active', type: 'boolean' },
        ],
        rows,
      },
    ],
  },
  limits,
);
const renderStarted = Date.now();
const rendered = await api.renderSpreadsheet(normalized, limits);
const renderMs = Date.now() - renderStarted;

const firstStarted = Date.now();
await api.getSpreadsheetPreview({
  fileId: 'bench-file',
  filename: 'Students.xlsx',
  mimeType: rendered.mimeType,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  buffer: rendered.buffer,
  limit: 500,
});
const firstPreviewMs = Date.now() - firstStarted;

const cachedStarted = Date.now();
await api.getSpreadsheetPreview({
  fileId: 'bench-file',
  filename: 'Students.xlsx',
  mimeType: rendered.mimeType,
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  buffer: rendered.buffer,
  offset: 500,
  limit: 500,
});
const cachedPreviewMs = Date.now() - cachedStarted;

console.log(`normalize:        ${Date.now() - normalizeStarted} ms`);
console.log(`render 1k rows:   ${renderMs} ms (target < 500 ms)`);
console.log(`first preview:    ${firstPreviewMs} ms`);
console.log(`cached next page: ${cachedPreviewMs} ms (target < 300 ms)`);
console.log(`xlsx bytes:       ${rendered.buffer.length}`);

if (renderMs > 500 || cachedPreviewMs > 300) {
  console.error('File-tool performance target missed.');
  process.exitCode = 1;
}
