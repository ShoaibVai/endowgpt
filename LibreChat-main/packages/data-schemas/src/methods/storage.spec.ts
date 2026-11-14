import mongoose from 'mongoose';
import { createModels, logger } from '..';
import { FileContext } from 'librechat-data-provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { StorageMethods } from './storage';
import { createStorageMethods } from './storage';

/** Per-user accounting for the 100 MB document cap: current document content
 *  plus generated files, excluding version snapshots and temporary uploads. */

logger.silent = true;

let FileModel: mongoose.Model<Record<string, unknown>>;
let DocumentModel: mongoose.Model<Record<string, unknown>>;
let StorageModel: mongoose.Model<Record<string, unknown>>;
let methods: StorageMethods;
let mongoServer: MongoMemoryServer;

const userA = new mongoose.Types.ObjectId().toString();
const userB = new mongoose.Types.ObjectId().toString();

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  FileModel = mongoose.models.File;
  DocumentModel = mongoose.models.Document;
  StorageModel = mongoose.models.StorageUsage;
  await Promise.all([
    FileModel.syncIndexes(),
    DocumentModel.syncIndexes(),
    StorageModel.syncIndexes(),
  ]);
  methods = createStorageMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([
    FileModel.deleteMany({}),
    DocumentModel.deleteMany({}),
    StorageModel.deleteMany({}),
  ]);
});

describe('getUserStorageUsage', () => {
  test('sums current document bytes and generated files for the owner', async () => {
    await DocumentModel.create([
      {
        user: userA,
        conversationId: 'convo-1',
        artifactId: 'artifact-1',
        title: 'One',
        content: '# Hello',
      },
      {
        user: userA,
        conversationId: 'convo-1',
        artifactId: 'artifact-2',
        title: 'Two',
        content: 'héllo',
      },
    ]);
    await FileModel.create([
      {
        user: userA,
        file_id: 'generated-1',
        bytes: 100,
        filename: 'one.docx',
        filepath: '/uploads/one.docx',
        object: 'file',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        usage: 0,
        context: FileContext.message_attachment,
        metadata: { generatedFile: { version: 1 } },
      },
      {
        user: userA,
        file_id: 'generated-2',
        bytes: 250,
        filename: 'two.xlsx',
        filepath: '/uploads/two.xlsx',
        object: 'file',
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        usage: 0,
        context: FileContext.message_attachment,
        metadata: { generatedFile: { version: 1 } },
      },
      {
        user: userA,
        file_id: 'run-copy',
        bytes: 500,
        filename: 'published.docx',
        filepath: '/uploads/published.docx',
        object: 'file',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        usage: 0,
        context: FileContext.run_artifact,
        metadata: { generatedFile: { version: 1 } },
      },
      {
        user: userA,
        file_id: 'upload-1',
        bytes: 999,
        filename: 'temporary.pdf',
        filepath: '/uploads/temporary.pdf',
        object: 'file',
        type: 'application/pdf',
        usage: 0,
      },
    ]);

    const usage = await methods.getUserStorageUsage({ userId: userA });

    expect(usage.documentBytes).toBe(Buffer.byteLength('# Hello') + Buffer.byteLength('héllo'));
    expect(usage.generatedFileBytes).toBe(350);
    expect(usage.usedBytes).toBe(usage.documentBytes + 350);
  });

  test('does not count another user or a version snapshot body', async () => {
    await DocumentModel.create({
      user: userA,
      conversationId: 'convo-1',
      artifactId: 'artifact-1',
      title: 'One',
      content: 'current',
      versions: [
        {
          id: 'v1',
          title: 'One',
          content: 'a much larger historical snapshot that must not be counted',
          createdAt: Date.now(),
          source: 'user',
        },
      ],
    });
    await FileModel.create({
      user: userB,
      file_id: 'generated-b',
      bytes: 5_000,
      filename: 'other.docx',
      filepath: '/uploads/other.docx',
      object: 'file',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      usage: 0,
      context: FileContext.message_attachment,
      metadata: { generatedFile: { version: 1 } },
    });

    const usage = await methods.getUserStorageUsage({ userId: userA });

    expect(usage).toEqual({
      usedBytes: Buffer.byteLength('current'),
      documentBytes: Buffer.byteLength('current'),
      generatedFileBytes: 0,
    });
  });

  test('reports zero for a user with no saved data', async () => {
    await expect(methods.getUserStorageUsage({ userId: userA })).resolves.toEqual({
      usedBytes: 0,
      documentBytes: 0,
      generatedFileBytes: 0,
    });
  });

  test('rejects a non-ObjectId owner instead of returning a false zero', async () => {
    await expect(methods.getUserStorageUsage({ userId: 'not-an-id' })).rejects.toThrow(
      /valid user id/,
    );
  });
});

describe('document storage counter', () => {
  test('reserves growth atomically and releases it again', async () => {
    await DocumentModel.create({
      user: userA,
      conversationId: 'convo-1',
      artifactId: 'artifact-1',
      title: 'One',
      content: 'abc',
    });

    expect((await methods.getUserStorageUsage({ userId: userA })).documentBytes).toBe(3);

    await expect(
      methods.reserveDocumentStorage({ userId: userA, bytes: 5, limit: 100 }),
    ).resolves.toEqual({ ok: true });
    expect((await methods.getUserStorageUsage({ userId: userA })).documentBytes).toBe(8);

    await methods.releaseDocumentStorage({ userId: userA, bytes: 5 });
    expect((await methods.getUserStorageUsage({ userId: userA })).documentBytes).toBe(3);
  });

  test('denies a reservation past the cap and reports current usage', async () => {
    await DocumentModel.create({
      user: userA,
      conversationId: 'convo-1',
      artifactId: 'artifact-1',
      title: 'One',
      content: 'abc',
    });

    const denied = await methods.reserveDocumentStorage({ userId: userA, bytes: 3, limit: 5 });
    expect(denied).toEqual({
      ok: false,
      usage: { usedBytes: 3, documentBytes: 3, generatedFileBytes: 0 },
    });
    await expect(
      methods.reserveDocumentStorage({ userId: userA, bytes: 2, limit: 5 }),
    ).resolves.toEqual({ ok: true });
    expect((await methods.getUserStorageUsage({ userId: userA })).documentBytes).toBe(5);
  });

  test('generated files consume the shared headroom', async () => {
    await FileModel.create({
      user: userA,
      file_id: 'generated-1',
      bytes: 100,
      filename: 'one.docx',
      filepath: '/uploads/one.docx',
      object: 'file',
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      usage: 0,
      context: FileContext.message_attachment,
      metadata: { generatedFile: { version: 1 } },
    });

    const denied = await methods.reserveDocumentStorage({ userId: userA, bytes: 20, limit: 110 });
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.usage.generatedFileBytes).toBe(100);
    }
    await expect(
      methods.reserveDocumentStorage({ userId: userA, bytes: 10, limit: 110 }),
    ).resolves.toEqual({ ok: true });
  });
});
