import { randomUUID } from 'node:crypto';
import { FileContext, FileSources } from 'librechat-data-provider';
import type { TFile } from 'librechat-data-provider';
import type { GeneratedFileCounts, GeneratedFormat } from './types';
import type { GeneratedFileLimits } from './limits';
import { sanitizeGeneratedFilename } from './filename';

export const GENERATED_FILE_STORAGE_CODE = 'storage_quota_exceeded';

/** Generated files are the main consumer of the per-user document budget.
 *  The message is safe to hand back to the model and tells it what the user
 *  must do; storage internals stay out of it. */
export class GeneratedFileStorageQuotaError extends Error {
  readonly code: string = GENERATED_FILE_STORAGE_CODE;
  readonly usedBytes: number;
  readonly limitBytes: number;

  constructor(usedBytes: number, limitBytes: number) {
    super(
      `The user's document storage is full (${formatMegabytes(usedBytes)} of ${formatMegabytes(
        limitBytes,
      )} used). Ask them to delete older documents or files in My Files or the Documents page, then try again.`,
    );
    this.name = 'GeneratedFileStorageQuotaError';
    this.usedBytes = usedBytes;
    this.limitBytes = limitBytes;
  }
}

function formatMegabytes(bytes: number): string {
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

export type GeneratedFileRecord = Omit<TFile, 'user' | '_id' | '__v' | 'expiredAt'> & {
  user: string;
  __v?: number;
  expiredAt?: Date | null;
};

export type PersistGeneratedFileDependencies = {
  fileStrategy?: string;
  saveBuffer: (args: {
    userId: string;
    buffer: Buffer;
    fileName: string;
    basePath: 'uploads';
    tenantId?: string;
  }) => Promise<string>;
  getStorageMetadata: (args: { filepath: string; source: string }) => {
    storageKey?: string;
    storageRegion?: string;
  };
  createFile: (data: GeneratedFileRecord, disableTTL?: boolean) => Promise<unknown>;
  deleteStored?: (file: TFile) => Promise<void>;
  /** Current usage across saved documents and generated files. */
  getUserStorageUsage?: (args: {
    userId: string;
    tenantId?: string;
  }) => Promise<{ usedBytes: number }>;
  expiredAt?: Date | null;
  logger?: {
    error: (message: string, error?: unknown) => void;
  };
};

export type PersistGeneratedFileParams = {
  req: {
    user?: {
      id?: string;
      tenantId?: string | null;
    } | null;
    body?: {
      conversationId?: string;
      messageId?: string;
    } | null;
  };
  buffer: Buffer;
  filename: string;
  format: GeneratedFormat;
  mimeType: string;
  counts: GeneratedFileCounts;
  conversationId?: string;
  messageId?: string;
  limits: GeneratedFileLimits;
  /** Per-user budget resolved from `documents.storageMaxBytes`. */
  storageMaxBytes?: number;
};

function recordToFile(record: GeneratedFileRecord): TFile {
  return {
    ...record,
    object: 'file',
    embedded: false,
    usage: record.usage ?? 0,
  };
}

/**
 * Persists an in-process generated buffer as a normal user-owned file.
 *
 * This deliberately mirrors the durable half of `execute_code` output
 * persistence — same storage strategy, same `createFile` commit, same
 * retention deadline, same `TFile` shape — without a Code API identity or a
 * `metadata.codeEnvRef`. Those are only valid for bytes that really live in a
 * code sandbox; writing one here would make file deletion call a sandbox that
 * never had the file.
 */
export async function persistGeneratedFile(
  params: PersistGeneratedFileParams,
  deps: PersistGeneratedFileDependencies,
): Promise<TFile> {
  const userId = params.req.user?.id;
  if (!userId) {
    throw new Error('A signed-in user is required to create a file');
  }
  if (params.buffer.length > params.limits.maxBytes) {
    throw new Error(`The generated file exceeds the ${params.limits.maxBytes} byte limit`);
  }
  if (params.storageMaxBytes != null && deps.getUserStorageUsage != null) {
    let usage: { usedBytes: number };
    try {
      usage = await deps.getUserStorageUsage({
        userId,
        ...(params.req.user?.tenantId ? { tenantId: params.req.user.tenantId } : {}),
      });
    } catch (error) {
      deps.logger?.error('[persistGeneratedFile] Failed to measure document storage', error);
      throw new Error('Document storage could not be checked right now. Please try again.');
    }
    if (usage.usedBytes + params.buffer.length > params.storageMaxBytes) {
      throw new GeneratedFileStorageQuotaError(usage.usedBytes, params.storageMaxBytes);
    }
  }

  const { filename } = sanitizeGeneratedFilename(params.filename, [params.format], params.format);
  const fileId = randomUUID();
  const fileName = `${fileId}__${filename}`;
  const fileStrategy = deps.fileStrategy ?? FileSources.local;
  let filepath: string;
  try {
    filepath = await deps.saveBuffer({
      userId,
      buffer: params.buffer,
      fileName,
      basePath: 'uploads',
      ...(params.req.user?.tenantId ? { tenantId: params.req.user.tenantId } : {}),
    });
  } catch (error) {
    deps.logger?.error('[persistGeneratedFile] Failed to store generated file', error);
    throw error;
  }

  const storageMetadata = deps.getStorageMetadata({ filepath, source: fileStrategy });
  const now = new Date();
  const record: GeneratedFileRecord = {
    file_id: fileId,
    user: userId,
    ...(params.req.user?.tenantId ? { tenantId: params.req.user.tenantId } : {}),
    ...(params.conversationId || params.req.body?.conversationId
      ? { conversationId: params.conversationId ?? params.req.body?.conversationId }
      : {}),
    ...(params.messageId || params.req.body?.messageId
      ? { messageId: params.messageId ?? params.req.body?.messageId }
      : {}),
    bytes: params.buffer.length,
    filename,
    filepath,
    ...storageMetadata,
    object: 'file',
    type: params.mimeType,
    usage: 0,
    embedded: false,
    source: fileStrategy as FileSources,
    context: FileContext.message_attachment,
    metadata: { generatedFile: params.counts },
    createdAt: now,
    updatedAt: now,
    ...(deps.expiredAt != null ? { expiredAt: deps.expiredAt } : {}),
  };

  try {
    await deps.createFile(record, true);
  } catch (error) {
    deps.logger?.error('[persistGeneratedFile] Failed to write generated file record', error);
    try {
      await deps.deleteStored?.(recordToFile(record));
    } catch (cleanupError) {
      deps.logger?.error(
        '[persistGeneratedFile] Failed to clean up stored bytes after a database failure',
        cleanupError,
      );
    }
    throw error;
  }

  return recordToFile(record);
}
