import { convertPptxToPdf, isPptxPreviewEnabled } from '~/files/documents/libreoffice';

export { isPptxPreviewEnabled };

export class PptxPreviewUnavailableError extends Error {
  readonly code = 'PPTX_PREVIEW_UNAVAILABLE';

  constructor(message = 'PPTX preview is unavailable') {
    super(message);
    this.name = 'PptxPreviewUnavailableError';
  }
}

type PptxCacheEntry = {
  pdf: Buffer;
  size: number;
  usedAt: number;
};

const MAX_CACHE_ENTRIES = 3;
const MAX_CACHE_BYTES = 100 * 1024 * 1024;
const cache = new Map<string, PptxCacheEntry>();
let cacheBytes = 0;

function cacheKey(fileId: string, updatedAt?: string | Date, bufferLength?: number): string {
  return `${fileId}:${updatedAt != null ? String(updatedAt) : 'unknown'}:${bufferLength ?? 0}`;
}

function readCache(key: string): Buffer | undefined {
  const entry = cache.get(key);
  if (entry == null) {
    return undefined;
  }
  entry.usedAt = Date.now();
  cache.delete(key);
  cache.set(key, entry);
  return entry.pdf;
}

function writeCache(key: string, pdf: Buffer): void {
  const existing = cache.get(key);
  if (existing != null) {
    cacheBytes -= existing.size;
    cache.delete(key);
  }
  cache.set(key, { pdf, size: pdf.length, usedAt: Date.now() });
  cacheBytes += pdf.length;
  while ((cache.size > MAX_CACHE_ENTRIES || cacheBytes > MAX_CACHE_BYTES) && cache.size > 1) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (oldestKey == null) {
      break;
    }
    const oldest = cache.get(oldestKey);
    if (oldest == null) {
      break;
    }
    cacheBytes -= oldest.size;
    cache.delete(oldestKey);
  }
}

export function clearPptxPreviewCache(): void {
  cache.clear();
  cacheBytes = 0;
}

/**
 * Converts a stored PPTX to PDF for the side-panel viewer. The flag is checked
 * before touching the binary so a disabled deployment never probes or spawns
 * LibreOffice.
 */
export async function getPptxPdfPreview({
  fileId,
  updatedAt,
  buffer,
}: {
  fileId: string;
  updatedAt?: string | Date;
  buffer: Buffer;
}): Promise<Buffer> {
  if (!isPptxPreviewEnabled()) {
    throw new PptxPreviewUnavailableError();
  }
  const key = cacheKey(fileId, updatedAt, buffer.length);
  const cached = readCache(key);
  if (cached != null) {
    return cached;
  }
  const pdf = await convertPptxToPdf(buffer);
  writeCache(key, pdf);
  return pdf;
}
