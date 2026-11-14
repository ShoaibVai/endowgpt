import type { Model, Types } from 'mongoose';
import type {
  IDocument,
  IDocumentLean,
  IDocumentVersion,
  IDocumentVersionMeta,
  IDocumentVersionRecord,
  DocumentUpsertParams,
  DocumentUpsertResult,
  DocumentRestoreParams,
  DocumentRestoreResult,
} from '~/types/document';

/** Version ids must stay unique per document without relying on Mongo id
 *  cold-start collisions; a timestamp plus random suffix is unique enough per
 *  snapshot and never guessable by a stale writer. */
function newVersionId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const DEFAULT_VERSION_CAP = 50;

function bytesOf(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

/** The document a snapshot belongs to, as callers name it. */
type DocKey = {
  userId: string | Types.ObjectId;
  conversationId: string;
  artifactId: string;
};

/** The same key as a Mongo filter. */
type DocFilter = {
  user: string | Types.ObjectId;
  conversationId: string;
  artifactId: string;
};

function toFilter({ userId, conversationId, artifactId }: DocKey): DocFilter {
  return { user: userId, conversationId, artifactId };
}

export interface DocumentMethods {
  getDocuments: (userId: string) => Promise<IDocumentLean[]>;
  getDocument: (params: DocKey) => Promise<IDocument | null>;
  getDocumentVersions: (params: DocKey) => Promise<IDocumentVersionMeta[]>;
  upsertDocument: (params: DocumentUpsertParams) => Promise<DocumentUpsertResult>;
  getDocumentVersion: (params: DocKey & { versionId: string }) => Promise<IDocumentVersion | null>;
  restoreDocumentVersion: (params: DocumentRestoreParams) => Promise<DocumentRestoreResult>;
  deleteDocument: (params: DocKey) => Promise<boolean>;
  deleteUserDocuments: (userId: string) => Promise<number>;
}

export function createDocumentMethods(mongoose: typeof import('mongoose')): DocumentMethods {
  const Documents = () => mongoose.models.Document as Model<IDocument>;
  const Versions = () => mongoose.models.DocumentVersion as Model<IDocumentVersionRecord>;

  /** Aggregation (unlike `find`) does not cast a string to ObjectId, so the
   *  owner is converted explicitly; an unparseable id owns nothing. */
  async function getDocuments(userId: string): Promise<IDocumentLean[]> {
    if (!mongoose.isObjectIdOrHexString(userId)) {
      return [];
    }
    type DocumentListRow = {
      artifactId: string;
      conversationId: string;
      title: string;
      updatedAt?: Date | number;
      versionCount?: number;
    };
    /** Project the stored snapshot count; `versions` is only read for rows that
     *  predate the split, so the list never transfers snapshot bodies. */
    const docs = await Documents().aggregate<DocumentListRow>([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      { $sort: { updatedAt: -1 } },
      {
        $project: {
          _id: 0,
          artifactId: 1,
          conversationId: 1,
          title: 1,
          updatedAt: 1,
          versionCount: {
            $ifNull: ['$versionCount', { $size: { $ifNull: ['$versions', []] } }],
          },
        },
      },
    ]);
    return docs.map((doc) => ({
      artifactId: doc.artifactId,
      conversationId: doc.conversationId,
      title: doc.title,
      updatedAt:
        doc.updatedAt instanceof Date ? doc.updatedAt.getTime() : Number(doc.updatedAt ?? 0),
      versionCount: doc.versionCount ?? 0,
    }));
  }

  async function getDocument(params: DocKey): Promise<IDocument | null> {
    return Documents().findOne(toFilter(params)).lean<IDocument | null>();
  }

  /** Snapshots written before the collection split, if any remain on the row. */
  async function embeddedSnapshots(
    filter: DocFilter,
  ): Promise<{ present: boolean; versions: IDocumentVersion[] }> {
    const row = await Documents()
      .findOne(filter)
      .select('versions')
      .lean<{ versions?: IDocumentVersion[] } | null>();
    if (row == null) {
      return { present: false, versions: [] };
    }
    return {
      present: Object.prototype.hasOwnProperty.call(row, 'versions'),
      versions: row.versions ?? [],
    };
  }

  /** Copies embedded snapshots into the version collection once per document.
   *  Returns true when the caller must `$unset` the legacy field. Individual
   *  upserts (not `bulkWrite`) so the tenant plugin stamps each row. */
  async function importEmbeddedSnapshots(filter: DocFilter): Promise<boolean> {
    const { present, versions } = await embeddedSnapshots(filter);
    if (!present) {
      return false;
    }
    await Promise.all(
      versions.map((version) =>
        Versions().updateOne(
          { ...filter, id: version.id },
          {
            $setOnInsert: {
              ...filter,
              id: version.id,
              title: version.title,
              content: version.content,
              createdAt: version.createdAt,
              source: version.source ?? 'user',
            },
          },
          { upsert: true },
        ),
      ),
    );
    return true;
  }

  /** Drops the oldest snapshots beyond the cap and reports the final count. */
  async function pruneSnapshots(filter: DocFilter, cap: number): Promise<number> {
    const count = await Versions().countDocuments(filter);
    if (count <= cap) {
      return count;
    }
    const oldest = await Versions()
      .find(filter)
      .sort({ createdAt: 1, _id: 1 })
      .limit(count - cap)
      .select('_id')
      .lean<Array<{ _id: Types.ObjectId }>>();
    if (oldest.length > 0) {
      await Versions().deleteMany({ _id: { $in: oldest.map((row) => row._id) } });
    }
    return cap;
  }

  async function insertSnapshot(
    filter: DocFilter,
    snapshot: IDocumentVersion,
    cap: number,
  ): Promise<number> {
    await Versions().updateOne(
      { ...filter, id: snapshot.id },
      { $setOnInsert: { ...filter, ...snapshot } },
      { upsert: true },
    );
    return pruneSnapshots(filter, cap);
  }

  async function getDocumentVersions(params: DocKey): Promise<IDocumentVersionMeta[]> {
    const filter = toFilter(params);
    const rows = await Versions()
      .find(filter)
      .select('id title createdAt source -_id')
      .sort({ createdAt: 1, _id: 1 })
      .lean<IDocumentVersionMeta[]>();
    if (rows.length > 0) {
      return rows;
    }
    const legacy = await embeddedSnapshots(filter);
    return legacy.versions.map(({ id, title, createdAt, source }) => ({
      id,
      title,
      createdAt,
      source,
    }));
  }

  /**
   * Idempotent upsert: one row per (user, conversationId, artifactId). Every
   * write appends a snapshot in `documentversions` (source defaults to 'user'),
   * prunes beyond the cap, and stamps `lastVersionId`. When the caller passes a
   * `baseVersionId`, a mismatch with the doc's `lastVersionId` routes the write
   * to a conflict instead of overwriting another session's work.
   */
  async function upsertDocument({
    userId,
    conversationId,
    artifactId,
    title,
    content,
    versionSource = 'user',
    baseVersionId,
    versionHistoryCap = DEFAULT_VERSION_CAP,
    existing: loadedExisting,
  }: DocumentUpsertParams): Promise<DocumentUpsertResult> {
    const filter = { user: userId, conversationId, artifactId };
    const existing =
      loadedExisting !== undefined
        ? loadedExisting
        : await getDocument({ userId, conversationId, artifactId });
    if (existing != null && baseVersionId != null && existing.lastVersionId !== baseVersionId) {
      return { ok: false, code: 'conflict', document: existing };
    }

    const migrateLegacy = existing != null && existing.versionCount == null;
    const legacyPresent = migrateLegacy ? await importEmbeddedSnapshots(filter) : false;

    const versionId = newVersionId();
    const versionCount = await insertSnapshot(
      filter,
      {
        id: versionId,
        title,
        content,
        createdAt: Date.now(),
        source: String(versionSource ?? 'user'),
      },
      versionHistoryCap,
    );

    const update: Record<string, unknown> = {
      $set: {
        title,
        content,
        contentBytes: bytesOf(content),
        lastVersionId: versionId,
        versionCount,
      },
    };
    if (legacyPresent) {
      update.$unset = { versions: '' };
    }

    const document = await Documents()
      .findOneAndUpdate(filter, update, {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      })
      .lean<IDocument | null>();

    if (document == null) {
      throw new Error('[DocumentMethods] upsertDocument lost the write');
    }
    return { ok: true, document };
  }

  async function getDocumentVersion({
    userId,
    conversationId,
    artifactId,
    versionId,
  }: DocKey & { versionId: string }): Promise<IDocumentVersion | null> {
    const filter = { user: userId, conversationId, artifactId };
    const row = await Versions()
      .findOne({ ...filter, id: versionId })
      .lean<IDocumentVersionRecord | null>();
    if (row != null) {
      return {
        id: row.id,
        title: row.title,
        content: row.content,
        createdAt: row.createdAt,
        source: row.source,
      };
    }
    /** Embedded fallback until the document's next write imports its history. */
    const legacy = await Documents()
      .findOne(filter, { versions: { $elemMatch: { id: versionId } } })
      .lean<{ versions?: IDocumentVersion[] } | null>();
    return legacy?.versions?.[0] ?? null;
  }

  /** Restore snapshot: the restored content becomes the current content and a
   *  fresh snapshot records the pre-restore state — history is never
   *  rewritten, so an accidental restore is itself undoable. */
  async function restoreDocumentVersion({
    userId,
    conversationId,
    artifactId,
    versionId,
    versionHistoryCap = DEFAULT_VERSION_CAP,
  }: DocumentRestoreParams): Promise<DocumentRestoreResult> {
    const filter = { user: userId, conversationId, artifactId };
    const existing = await getDocument({ userId, conversationId, artifactId });
    if (existing == null) {
      return { ok: false, code: 'not_found' };
    }

    const target = await getDocumentVersion({ userId, conversationId, artifactId, versionId });
    if (target == null) {
      return { ok: false, code: 'not_found' };
    }

    const legacyPresent =
      existing.versionCount == null ? await importEmbeddedSnapshots(filter) : false;

    const now = Date.now();
    await insertSnapshot(
      filter,
      {
        id: newVersionId(),
        title: existing.title,
        content: existing.content,
        createdAt: now,
        source: 'restore',
      },
      versionHistoryCap,
    );
    /** The restored content becomes its own snapshot too, so "current version"
     *  in the UI names the state the editor is showing. */
    const restoredId = newVersionId();
    const versionCount = await insertSnapshot(
      filter,
      {
        id: restoredId,
        title: target.title,
        content: target.content,
        createdAt: now + 1,
        source: 'restore',
      },
      versionHistoryCap,
    );

    const update: Record<string, unknown> = {
      $set: {
        title: target.title,
        content: target.content,
        contentBytes: bytesOf(target.content),
        lastVersionId: restoredId,
        versionCount,
      },
    };
    if (legacyPresent) {
      update.$unset = { versions: '' };
    }

    const document = await Documents()
      .findOneAndUpdate(filter, update, { new: true, runValidators: true })
      .lean<IDocument | null>();

    return document != null ? { ok: true, document } : { ok: false, code: 'not_found' };
  }

  async function deleteDocument(params: DocKey): Promise<boolean> {
    const filter = toFilter(params);
    const result = await Documents().deleteOne(filter);
    if (result.deletedCount === 0) {
      return false;
    }
    await Versions().deleteMany(filter);
    return true;
  }

  /** Account erasure: drop every document and snapshot the user saved. */
  async function deleteUserDocuments(userId: string): Promise<number> {
    await Versions().deleteMany({ user: userId });
    await mongoose.models.StorageUsage.deleteOne({ user: userId });
    const result = await Documents().deleteMany({ user: userId });
    return result.deletedCount;
  }

  return {
    getDocuments,
    getDocument,
    getDocumentVersions,
    upsertDocument,
    getDocumentVersion,
    restoreDocumentVersion,
    deleteDocument,
    deleteUserDocuments,
  };
}
