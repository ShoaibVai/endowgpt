import type {
  IDocument,
  IDocumentLean,
  IDocumentVersion,
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

/** The storage interface the app consumes; explicit type because build
 *  constraints (`isolatedDeclarations`) refuse implicit object literals. */
export interface DocumentMethods {
  getDocuments: (userId: string) => Promise<IDocumentLean[]>;
  getDocument: (params: {
    userId: string | import('mongoose').Types.ObjectId;
    conversationId: string;
    artifactId: string;
  }) => Promise<IDocument | null>;
  upsertDocument: (params: DocumentUpsertParams) => Promise<DocumentUpsertResult>;
  getDocumentVersion: (params: {
    userId: string | import('mongoose').Types.ObjectId;
    conversationId: string;
    artifactId: string;
    versionId: string;
  }) => Promise<IDocumentVersion | null>;
  restoreDocumentVersion: (params: DocumentRestoreParams) => Promise<DocumentRestoreResult>;
  deleteDocument: (params: {
    userId: string | import('mongoose').Types.ObjectId;
    conversationId: string;
    artifactId: string;
  }) => Promise<boolean>;
  deleteUserDocuments: (userId: string) => Promise<number>;
}

export function createDocumentMethods(
  mongoose: typeof import('mongoose'),
): DocumentMethods {
  type ObjectIdLike = string | import('mongoose').Types.ObjectId;

  async function getDocuments(userId: string): Promise<IDocumentLean[]> {
    const Document = mongoose.models.Document;
    const docs = await Document.find({ user: userId })
      .select('artifactId conversationId title updatedAt versions')
      .sort({ updatedAt: -1 })
      .lean<
        Array<{
          artifactId: string;
          conversationId: string;
          title: string;
          updatedAt?: Date | number;
          versions?: IDocumentVersion[];
        }>
      >();
    /** The list view needs a count, not every snapshot body: computing it here
     *  keeps the payload small and matches `IDocumentLean`. */
    return docs.map((doc) => ({
      artifactId: doc.artifactId,
      conversationId: doc.conversationId,
      title: doc.title,
      updatedAt:
        doc.updatedAt instanceof Date ? doc.updatedAt.getTime() : Number(doc.updatedAt ?? 0),
      versionCount: doc.versions?.length ?? 0,
    }));
  }

  async function getDocument({
    userId,
    conversationId,
    artifactId,
  }: {
    userId: ObjectIdLike;
    conversationId: string;
    artifactId: string;
  }): Promise<IDocument | null> {
    const Document = mongoose.models.Document;
    return Document.findOne({
      user: userId,
      conversationId,
      artifactId,
    }).lean<IDocument | null>();
  }

  /**
   * Idempotent upsert: one row per (user, conversationId, artifactId). Every
   * write snapshots the incoming content (source defaults to 'user'), prunes
   * beyond the cap, and stamps `lastVersionId`. When the caller passes a
   * `baseVersionId`, a mismatch with the doc's `lastVersionId` routes the
   * write to a conflict instead of overwriting another session's work.
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
  }: DocumentUpsertParams): Promise<DocumentUpsertResult> {
    const filter = { user: userId, conversationId, artifactId };
    const Document = mongoose.models.Document;

    const existing = await getDocument({ userId, conversationId, artifactId });
    if (existing != null && baseVersionId != null && existing.lastVersionId !== baseVersionId) {
      return { ok: false, code: 'conflict', document: existing };
    }

    const versionId = newVersionId();
    const snapshot = {
      id: versionId,
      title,
      content,
      createdAt: Date.now(),
      source: String(versionSource ?? 'user'),
    };
    const versions = [...(existing?.versions ?? []), snapshot];
    while (versions.length > versionHistoryCap) {
      versions.shift();
    }

    const document = await Document.findOneAndUpdate(
      filter,
      { $set: { title, content, versions, lastVersionId: versionId } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).lean<IDocument | null>();

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
  }: {
    userId: ObjectIdLike;
    conversationId: string;
    artifactId: string;
    versionId: string;
  }): Promise<IDocumentVersion | null> {
    const document = await getDocument({ userId, conversationId, artifactId });
    return document?.versions?.find((version) => version.id === versionId) ?? null;
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
    const existing = await getDocument({ userId, conversationId, artifactId });
    if (existing == null) {
      return { ok: false, code: 'not_found' };
    }
    const target = existing.versions?.find((version) => version.id === versionId);
    if (target == null) {
      return { ok: false, code: 'not_found' };
    }

    const preRestoreId = newVersionId();
    const restoredId = newVersionId();
    const now = Date.now();
    const versions: IDocumentVersion[] = [
      ...(existing.versions ?? []),
      {
        id: preRestoreId,
        title: existing.title,
        content: existing.content,
        createdAt: now,
        source: 'restore',
      },
      /** The restored content becomes its own snapshot too, so "current
       *  version" in the UI names the state the editor is showing and the
       *  restored snapshot stays reachable in history. */
      {
        id: restoredId,
        title: target.title,
        content: target.content,
        createdAt: now + 1,
        source: 'restore',
      },
    ];
    while (versions.length > versionHistoryCap) {
      versions.shift();
    }

    const Document = mongoose.models.Document;
    const document = await Document.findOneAndUpdate(
      { user: userId, conversationId, artifactId },
      {
        $set: {
          title: target.title,
          content: target.content,
          versions,
          lastVersionId: restoredId,
        },
      },
      { new: true, runValidators: true },
    ).lean<IDocument | null>();

    return document != null ? { ok: true, document } : { ok: false, code: 'not_found' };
  }

  async function deleteDocument({
    userId,
    conversationId,
    artifactId,
  }: {
    userId: ObjectIdLike;
    conversationId: string;
    artifactId: string;
  }): Promise<boolean> {
    const Document = mongoose.models.Document;
    const result = await Document.deleteOne({ user: userId, conversationId, artifactId });
    return result.deletedCount > 0;
  }

  /** Account erasure: drop every document the user saved. */
  async function deleteUserDocuments(userId: string): Promise<number> {
    const Document = mongoose.models.Document;
    const result = await Document.deleteMany({ user: userId });
    return result.deletedCount;
  }

  return {
    getDocuments,
    getDocument,
    upsertDocument,
    getDocumentVersion,
    restoreDocumentVersion,
    deleteDocument,
    deleteUserDocuments,
  };
}
