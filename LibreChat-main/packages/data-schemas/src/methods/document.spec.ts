import mongoose from 'mongoose';
import { logger, createModels } from '..';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createDocumentMethods } from './document';
import type { DocumentMethods } from './document';

/** Storage contract for the document editor (PLAN.md §7, §10): one row per
 *  (user, conversation, artifact), rolling snapshots on every write, conflict
 *  detection on a stale base, and restores that append instead of rewriting. */

logger.silent = true;

let Document: mongoose.Model<unknown>;
let methods: DocumentMethods;
let mongoServer: MongoMemoryServer;

const userA = new mongoose.Types.ObjectId().toString();
const userB = new mongoose.Types.ObjectId().toString();

const base = {
  conversationId: 'convo-1',
  artifactId: 'artifact-1',
  title: 'Draft',
  content: '# Version 1',
};

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
  createModels(mongoose);
  Document = mongoose.models.Document;
  await Document.syncIndexes();
  methods = createDocumentMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Document.deleteMany({});
});

describe('upsertDocument', () => {
  test('creates the row and its first snapshot', async () => {
    const result = await methods.upsertDocument({ userId: userA, ...base });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.document.content).toBe('# Version 1');
    expect(result.document.versions).toHaveLength(1);
    expect(result.document.versions?.[0]).toMatchObject({
      title: 'Draft',
      content: '# Version 1',
      source: 'user',
    });
    expect(result.document.lastVersionId).toBe(result.document.versions?.[0]?.id);
    expect(await Document.countDocuments({ user: userA })).toBe(1);
  });

  test('appends a snapshot when the caller saw the current version', async () => {
    const first = await methods.upsertDocument({ userId: userA, ...base });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    const second = await methods.upsertDocument({
      userId: userA,
      ...base,
      title: 'Draft two',
      content: '# Version 2',
      baseVersionId: first.document.lastVersionId,
      versionSource: 'ai_edit',
    });

    expect(second.ok).toBe(true);
    if (!second.ok) {
      return;
    }
    expect(second.document.versions).toHaveLength(2);
    expect(second.document.versions?.[1]).toMatchObject({
      title: 'Draft two',
      content: '# Version 2',
      source: 'ai_edit',
    });
    expect(second.document.lastVersionId).toBe(second.document.versions?.[1]?.id);
    expect(second.document.lastVersionId).not.toBe(first.document.lastVersionId);
  });

  test('routes a stale baseVersionId to a conflict without touching the row', async () => {
    await methods.upsertDocument({ userId: userA, ...base });

    const stale = await methods.upsertDocument({
      userId: userA,
      ...base,
      content: '# Stale write',
      baseVersionId: 'version-from-another-session',
    });

    expect(stale.ok).toBe(false);
    if (stale.ok) {
      return;
    }
    expect(stale.code).toBe('conflict');
    expect(stale.document.content).toBe('# Version 1');
    expect(stale.document.versions).toHaveLength(1);
  });

  test('prunes the oldest snapshots beyond versionHistoryCap', async () => {
    const first = await methods.upsertDocument({ userId: userA, ...base });
    if (!first.ok) {
      throw new Error('seed failed');
    }
    const second = await methods.upsertDocument({
      userId: userA,
      ...base,
      content: '# Version 2',
      baseVersionId: first.document.lastVersionId,
    });
    if (!second.ok) {
      throw new Error('seed failed');
    }

    const third = await methods.upsertDocument({
      userId: userA,
      ...base,
      content: '# Version 3',
      baseVersionId: second.document.lastVersionId,
      versionHistoryCap: 2,
    });

    expect(third.ok).toBe(true);
    if (!third.ok) {
      return;
    }
    expect(third.document.versions).toHaveLength(2);
    expect(third.document.versions?.map((version) => version.content)).toEqual([
      '# Version 2',
      '# Version 3',
    ]);
  });
});

describe('getDocument and getDocumentVersion', () => {
  test('reads a snapshot by id and returns null for an unknown id', async () => {
    const created = await methods.upsertDocument({ userId: userA, ...base });
    if (!created.ok) {
      throw new Error('seed failed');
    }
    const versionId = created.document.versions?.[0]?.id ?? '';

    const found = await methods.getDocumentVersion({
      userId: userA,
      conversationId: base.conversationId,
      artifactId: base.artifactId,
      versionId,
    });
    const missing = await methods.getDocumentVersion({
      userId: userA,
      conversationId: base.conversationId,
      artifactId: base.artifactId,
      versionId: 'does-not-exist',
    });

    expect(found).toMatchObject({ id: versionId, content: '# Version 1' });
    expect(missing).toBeNull();
  });

  test('scopes reads to the owning user', async () => {
    await methods.upsertDocument({ userId: userA, ...base });

    expect(
      await methods.getDocument({
        userId: userB,
        conversationId: base.conversationId,
        artifactId: base.artifactId,
      }),
    ).toBeNull();
  });
});

describe('restoreDocumentVersion', () => {
  test('restores content and appends both pre-restore and restored snapshots', async () => {
    const first = await methods.upsertDocument({ userId: userA, ...base });
    if (!first.ok) {
      throw new Error('seed failed');
    }
    const second = await methods.upsertDocument({
      userId: userA,
      ...base,
      title: 'Draft two',
      content: '# Version 2',
      baseVersionId: first.document.lastVersionId,
    });
    if (!second.ok) {
      throw new Error('seed failed');
    }

    const restored = await methods.restoreDocumentVersion({
      userId: userA,
      conversationId: base.conversationId,
      artifactId: base.artifactId,
      versionId: second.document.versions?.[0]?.id ?? '',
    });

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }
    expect(restored.document.title).toBe('Draft');
    expect(restored.document.content).toBe('# Version 1');
    expect(restored.document.versions).toHaveLength(4);
    expect(restored.document.versions?.[2]).toMatchObject({
      content: '# Version 2',
      source: 'restore',
    });
    expect(restored.document.versions?.[3]).toMatchObject({
      content: '# Version 1',
      source: 'restore',
    });
    expect(restored.document.lastVersionId).toBe(restored.document.versions?.[3]?.id);
  });

  test('returns not_found for an unknown version', async () => {
    await methods.upsertDocument({ userId: userA, ...base });

    const result = await methods.restoreDocumentVersion({
      userId: userA,
      conversationId: base.conversationId,
      artifactId: base.artifactId,
      versionId: 'unknown',
    });

    expect(result).toEqual({ ok: false, code: 'not_found' });
  });
});

describe('listing and deletion', () => {
  test('lists only the user documents, newest first, with a version count', async () => {
    const first = await methods.upsertDocument({ userId: userA, ...base });
    if (!first.ok) {
      throw new Error('seed failed');
    }
    await methods.upsertDocument({
      userId: userA,
      ...base,
      artifactId: 'artifact-2',
      title: 'Second',
    });
    await methods.upsertDocument({ userId: userB, ...base, artifactId: 'artifact-3' });

    const list = await methods.getDocuments(userA);

    expect(list).toHaveLength(2);
    expect(list.map((item) => item.artifactId).sort()).toEqual(['artifact-1', 'artifact-2']);
    const firstItem = list.find((item) => item.artifactId === 'artifact-1');
    expect(firstItem).toMatchObject({
      conversationId: base.conversationId,
      title: 'Draft',
      versionCount: 1,
    });
    expect(firstItem?.updatedAt).toBeGreaterThan(0);
  });

  test('deleteDocument is user scoped and deleteUserDocuments erases the account rows', async () => {
    await methods.upsertDocument({ userId: userA, ...base });
    await methods.upsertDocument({ userId: userB, ...base });

    expect(
      await methods.deleteDocument({
        userId: userB,
        conversationId: base.conversationId,
        artifactId: base.artifactId,
      }),
    ).toBe(true);
    expect(
      await methods.getDocument({
        userId: userA,
        conversationId: base.conversationId,
        artifactId: base.artifactId,
      }),
    ).not.toBeNull();

    expect(await methods.deleteUserDocuments(userA)).toBe(1);
    expect(
      await methods.getDocument({
        userId: userA,
        conversationId: base.conversationId,
        artifactId: base.artifactId,
      }),
    ).toBeNull();
  });
});
