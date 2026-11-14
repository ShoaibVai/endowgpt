import { FileContext } from 'librechat-data-provider';
import type { GeneratedFileRecord } from './persist';
import { DEFAULT_GENERATED_FILE_LIMITS } from './limits';
import { persistGeneratedFile } from './persist';

const limits = DEFAULT_GENERATED_FILE_LIMITS;

function makeDeps(overrides: Partial<Parameters<typeof persistGeneratedFile>[1]> = {}) {
  const records: GeneratedFileRecord[] = [];
  return {
    records,
    deps: {
      fileStrategy: 'local',
      saveBuffer: jest.fn(async () => '/uploads/user-1/generated.xlsx'),
      getStorageMetadata: jest.fn(() => ({ storageKey: 'generated.xlsx' })),
      createFile: jest.fn(async (record: GeneratedFileRecord) => {
        records.push(record);
        return record;
      }),
      getUserStorageUsage: jest.fn(async () => ({ usedBytes: 0 })),
      deleteStored: jest.fn(async () => undefined),
      expiredAt: new Date('2027-01-01T00:00:00Z'),
      logger: { error: jest.fn() },
      ...overrides,
    },
  };
}

const req = {
  user: { id: 'user-1', tenantId: 'tenant-1' },
  body: { conversationId: 'convo-1', messageId: 'message-1' },
};

describe('persistGeneratedFile', () => {
  it('stores bytes before writing a user-owned message attachment record', async () => {
    const { deps, records } = makeDeps();
    const file = await persistGeneratedFile(
      {
        req,
        buffer: Buffer.from('bytes'),
        filename: 'Students.xlsx',
        format: 'xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        counts: {
          version: 1,
          tool: 'create_spreadsheet',
          kind: 'spreadsheet',
          format: 'xlsx',
          sheets: 1,
          rows: 3,
        },
        limits,
      },
      deps,
    );

    expect(deps.saveBuffer).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        basePath: 'uploads',
        tenantId: 'tenant-1',
      }),
    );
    expect(deps.createFile).toHaveBeenCalledWith(expect.any(Object), true);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      user: 'user-1',
      tenantId: 'tenant-1',
      conversationId: 'convo-1',
      messageId: 'message-1',
      filename: 'Students.xlsx',
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      source: 'local',
      context: FileContext.message_attachment,
      bytes: 5,
      metadata: {
        generatedFile: {
          version: 1,
          tool: 'create_spreadsheet',
          kind: 'spreadsheet',
          format: 'xlsx',
          sheets: 1,
          rows: 3,
        },
      },
      expiredAt: new Date('2027-01-01T00:00:00Z'),
    });
    expect(records[0].file_id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(file).toEqual(expect.objectContaining({ file_id: records[0].file_id }));
  });

  it('uses tool-supplied conversation and message ids over request defaults', async () => {
    const { deps, records } = makeDeps();
    await persistGeneratedFile(
      {
        req,
        buffer: Buffer.from('bytes'),
        filename: 'Deck.pptx',
        format: 'pptx',
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        counts: {
          version: 1,
          tool: 'create_presentation',
          kind: 'presentation',
          format: 'pptx',
          slides: 2,
        },
        conversationId: 'run-convo',
        messageId: 'run-message',
        limits,
      },
      deps,
    );
    expect(records[0]).toMatchObject({
      conversationId: 'run-convo',
      messageId: 'run-message',
    });
  });

  it('cleans up stored bytes when the database write fails', async () => {
    const failure = new Error('database unavailable');
    const { deps } = makeDeps({
      createFile: jest.fn(async () => {
        throw failure;
      }),
    });

    await expect(
      persistGeneratedFile(
        {
          req,
          buffer: Buffer.from('bytes'),
          filename: 'Students.xlsx',
          format: 'xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          counts: {
            version: 1,
            tool: 'create_spreadsheet',
            kind: 'spreadsheet',
            format: 'xlsx',
            sheets: 1,
            rows: 1,
          },
          limits,
        },
        deps,
      ),
    ).rejects.toBe(failure);
    expect(deps.deleteStored).toHaveBeenCalledTimes(1);
  });

  it('rejects an oversized buffer before touching storage', async () => {
    const { deps } = makeDeps();
    await expect(
      persistGeneratedFile(
        {
          req,
          buffer: Buffer.alloc(limits.maxBytes + 1),
          filename: 'Students.xlsx',
          format: 'xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          counts: {
            version: 1,
            tool: 'create_spreadsheet',
            kind: 'spreadsheet',
            format: 'xlsx',
            sheets: 1,
            rows: 1,
          },
          limits,
        },
        deps,
      ),
    ).rejects.toThrow(/byte limit/);
    expect(deps.saveBuffer).not.toHaveBeenCalled();
  });

  it('rejects a file that would exceed the user storage cap before touching storage', async () => {
    const { deps } = makeDeps({
      getUserStorageUsage: jest.fn(async () => ({ usedBytes: 1 })),
    });
    await expect(
      persistGeneratedFile(
        {
          req,
          buffer: Buffer.from('bytes'),
          filename: 'Students.xlsx',
          format: 'xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          counts: {
            version: 1,
            tool: 'create_spreadsheet',
            kind: 'spreadsheet',
            format: 'xlsx',
            sheets: 1,
            rows: 1,
          },
          limits,
          storageMaxBytes: 4,
        },
        deps,
      ),
    ).rejects.toMatchObject({ code: 'storage_quota_exceeded' });
    expect(deps.getUserStorageUsage).toHaveBeenCalledWith({
      userId: 'user-1',
      tenantId: 'tenant-1',
    });
    expect(deps.saveBuffer).not.toHaveBeenCalled();
  });

  it('stores a file that fits under the user storage cap', async () => {
    const { deps } = makeDeps({
      getUserStorageUsage: jest.fn(async () => ({ usedBytes: 3 })),
    });
    await expect(
      persistGeneratedFile(
        {
          req,
          buffer: Buffer.from('bytes'),
          filename: 'Students.xlsx',
          format: 'xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          counts: {
            version: 1,
            tool: 'create_spreadsheet',
            kind: 'spreadsheet',
            format: 'xlsx',
            sheets: 1,
            rows: 1,
          },
          limits,
          storageMaxBytes: 8,
        },
        deps,
      ),
    ).resolves.toMatchObject({ bytes: 5 });
    expect(deps.saveBuffer).toHaveBeenCalledTimes(1);
  });
});
