import mongoose from 'mongoose';
import { logger, createModels } from '..';
import { MongoMemoryServer } from 'mongodb-memory-server';
import type { DocumentMethods } from './document';
import { createDocumentMethods } from './document';

/** Storage contract for the document editor (PLAN.md §7, §10): one row per
 *  (user, conversation, artifact), rolling snapshots in their own collection,
 *  conflict detection on a stale base, and restores that append instead of
 *  rewriting. */

logger.silent = true;

let Document: mongoose.Model<Record<string, unknown>>;
let DocumentVersion: mongoose.Model<Record<string, unknown>>;
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
  DocumentVersion = mongoose.models.DocumentVersion;
  await Promise.all([Document.syncIndexes(), DocumentVersion.syncIndexes()]);
  methods = createDocumentMethods(mongoose);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Promise.all([Document.deleteMany({}), DocumentVersion.deleteMany({})]);
});

describe('upsertDocument', () => {
  test('creates the row and its first snapshot', async () => {
    const result = await methods.upsertDocument({ userId: userA, ...base });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.document.content).toBe('# Version 1');
    expect(result.document.contentBytes).toBe(Buffer.byteLength('# Version 1'));
    expect(result.document.versionCount).toBe(1);
    expect(await Document.countDocuments({ user: userA })).toBe(1);

    const versions = await methods.getDocumentVersions({
      userId: userA,
      conversationId: base.conversationId,
      artifactId: base.artifactId,
    });
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ title: 'Draft' });
    expect(result.document.lastVersionId).toBe(versions[0]?.id);
    expect(
      await methods.getDocumentVersion({
        userId: userA,
        conversationId: base.conversationId,
        artifactId: base.artifactId,
        versionId: versions[0]?.id ?? '',
      }),
    ).toMatchObject({ content: '# Version 1', source: 'user' });
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
    expect(second.document.versionCount).toBe(2);
    expect(second.document.lastVersionId).not.toBe(first.document.lastVersionId);

    const versions = await methods.getDocumentVersions({
      userId: userA,
      conversationId: base.conversationId,
      artifactId: base.artifactId,
    });
    expect(versions).toHaveLength(2);
    expect(versions[1]).toMatchObject({ title: 'Draft two', source: 'ai_edit' });
    expect(
      await methods.getDocumentVersion({
        userId: userA,
        conversationId: base.conversationId,
        artifactId: base.artifactId,
        versionId: versions[1]?.id ?? '',
      }),
    ).toMatchObject({ content: '# Version 2' });
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
    expect(
      await methods.getDocumentVersions({
        userId: userA,
        conversationId: base.conversationId,
        artifactId: base.artifactId,
      }),
    ).toHaveLength(1);
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
    expect(third.document.versionCount).toBe(2);
    const versions = await methods.getDocumentVersions({
      userId: userA,
      conversationId: base.conversationId,
      artifactId: base.artifactId,
    });
    expect(versions).toHaveLength(2);
    const contents = await Promise.all(
      versions.map((version) =>
        methods.getDocumentVersion({
          userId: userA,
          conversationId: base.conversationId,
          artifactId: base.artifactId,
          versionId: version.id,
        }),
      ),
    );
    expect(contents.map((version) => version?.content)).toEqual(['# Version 2', '# Version 3']);
  });

  test('detects a conflict from the caller-supplied current row', async () => {
    const created = await methods.upsertDocument({ userId: userA, ...base });
    if (!created.ok) {
      throw new Error('seed failed');
    }

    const stale = await methods.upsertDocument({
      userId: userA,
      ...base,
      content: '# Stale write',
      baseVersionId: 'another-session',
      existing: created.document,
    });

    expect(stale.ok).toBe(false);
    if (stale.ok) {
      return;
    }
    expect(stale.code).toBe('conflict');
    expect(stale.document.content).toBe('# Version 1');
  });
});

describe('version history', () => {
  test('reads a snapshot by id and returns null for an unknown id', async () => {
    const created = await methods.upsertDocument({ userId: userA, ...base });
    if (!created.ok) {
      throw new Error('seed failed');
    }
    const versionId = created.document.lastVersionId ?? '';

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

  test('reads and migrates snapshots embedded before the collection split', async () => {
    await Document.collection.insertOne({
      user: new mongoose.Types.ObjectId(userA),
      conversationId: base.conversationId,
      artifactId: base.artifactId,
      title: base.title,
      content: '# Legacy current',
      versions: [
        { id: 'legacy-1', title: 'Draft', content: '# Legacy', createdAt: 5, source: 'user' },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(
      await methods.getDocumentVersions({
        userId: userA,
        conversationId: base.conversationId,
        artifactId: base.artifactId,
      }),
    ).toMatchObject([{ id: 'legacy-1', title: 'Draft' }]);
    expect(
      await methods.getDocumentVersion({
        userId: userA,
        conversationId: base.conversationId,
        artifactId: base.artifactId,
        versionId: 'legacy-1',
      }),
    ).toMatchObject({ content: '# Legacy' });

    const written = await methods.upsertDocument({
      userId: userA,
      ...base,
      content: '# New current',
    });
    expect(written.ok).toBe(true);
    if (!written.ok) {
      return;
    }
    expect(written.document.versionCount).toBe(2);
    const ids = (
      await methods.getDocumentVersions({
        userId: userA,
        conversationId: base.conversationId,
        artifactId: base.artifactId,
      })
    ).map((version) => version.id);
    expect(ids).toEqual(['legacy-1', written.document.lastVersionId]);

    const raw = await Document.findOne({
      user: userA,
      conversationId: base.conversationId,
      artifactId: base.artifactId,
    })
      .select('versions')
      .lean<{ versions?: unknown[] }>();
    expect(raw?.versions).toBeUndefined();
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
    expect(
      await methods.getDocumentVersions({
        userId: userB,
        conversationId: base.conversationId,
        artifactId: base.artifactId,
      }),
    ).toEqual([]);
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

    const firstVersionId = (
      await methods.getDocumentVersions({
        userId: userA,
        conversationId: base.conversationId,
        artifactId: base.artifactId,
      })
    )[0]?.id;

    const restored = await methods.restoreDocumentVersion({
      userId: userA,
      conversationId: base.conversationId,
      artifactId: base.artifactId,
      versionId: firstVersionId ?? '',
    });

    expect(restored.ok).toBe(true);
    if (!restored.ok) {
      return;
    }
    expect(restored.document.title).toBe('Draft');
    expect(restored.document.content).toBe('# Version 1');
    expect(restored.document.versionCount).toBe(4);

    const versions = await methods.getDocumentVersions({
      userId: userA,
      conversationId: base.conversationId,
      artifactId: base.artifactId,
    });
    expect(versions).toHaveLength(4);
    expect(versions[2]).toMatchObject({ source: 'restore' });
    expect(
      await methods.getDocumentVersion({
        userId: userA,
        conversationId: base.conversationId,
        artifactId: base.artifactId,
        versionId: versions[2]?.id ?? '',
      }),
    ).toMatchObject({ content: '# Version 2', source: 'restore' });
    expect(
      await methods.getDocumentVersion({
        userId: userA,
        conversationId: base.conversationId,
        artifactId: base.artifactId,
        versionId: versions[3]?.id ?? '',
      }),
    ).toMatchObject({ content: '# Version 1', source: 'restore' });
    expect(restored.document.lastVersionId).toBe(versions[3]?.id);
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
    expect(await methods.getDocuments('not-an-object-id')).toEqual([]);
  });

  test('deleteDocument is user scoped and erases the snapshots it owned', async () => {
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
    expect(
      await methods.getDocumentVersions({
        userId: userB,
        conversationId: base.conversationId,
        artifactId: base.artifactId,
      }),
    ).toEqual([]);
  });

  test('deleteUserDocuments erases the account rows and snapshots', async () => {
    await methods.upsertDocument({ userId: userA, ...base });
    await methods.upsertDocument({ userId: userA, ...base, artifactId: 'artifact-2' });

    expect(await methods.deleteUserDocuments(userA)).toBe(2);
    expect(
      await methods.getDocument({
        userId: userA,
        conversationId: base.conversationId,
        artifactId: base.artifactId,
      }),
    ).toBeNull();
    expect(await DocumentVersion.countDocuments({ user: userA })).toBe(0);
  });
});
