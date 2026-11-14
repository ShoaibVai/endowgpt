import type { Types, Document } from 'mongoose';

/** What produced a document version snapshot. */
export type DocumentVersionSource = 'model' | 'user' | 'ai_edit' | 'restore' | 'import';

export interface IDocumentVersion {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  source: string;
}

export interface IDocument extends Document {
  user: Types.ObjectId;
  conversationId: string;
  artifactId: string;
  title: string;
  content: string;
  /** The newest snapshot id, so a save can detect "changed elsewhere". */
  lastVersionId?: string;
  /** Number of snapshots in the `documentversions` collection. */
  versionCount?: number;
  /** UTF-8 size of `content`, maintained on write for quota accounting. */
  contentBytes?: number;
  /** Legacy rows still carry embedded snapshots until their next write. */
  versions?: IDocumentVersion[];
  tenantId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** What version lists and document payloads carry: no snapshot body. */
export type IDocumentVersionMeta = Omit<IDocumentVersion, 'content'>;

/** One snapshot row in the `documentversions` collection. */
export interface IDocumentVersionRecord {
  user: Types.ObjectId;
  conversationId: string;
  artifactId: string;
  id: string;
  title: string;
  content: string;
  createdAt: number;
  source: string;
  tenantId?: string;
}

export interface IDocumentLean {
  artifactId: string;
  conversationId: string;
  title: string;
  updatedAt: number;
  versionCount: number;
}

export interface DocumentUpsertParams {
  userId: string | Types.ObjectId;
  conversationId: string;
  artifactId: string;
  title: string;
  content: string;
  /** Snapshot source for the version created by this write. */
  versionSource?: DocumentVersionSource | string;
  /** When provided, the newest version the caller last saw; a mismatch routes
   *  the write to a conflict. */
  baseVersionId?: string;
  /** Hard cap on stored snapshots (the oldest is pruned beyond it). */
  versionHistoryCap?: number;
  /** Already-loaded current row, so a caller that read it for quota checks
   *  does not make the storage layer read it again. */
  existing?: IDocument | null;
}

export type DocumentUpsertResult =
  | { ok: true; document: IDocument }
  | { ok: false; code: 'conflict'; document: IDocument };

export interface DocumentRestoreParams {
  userId: string | Types.ObjectId;
  conversationId: string;
  artifactId: string;
  versionId: string;
  versionHistoryCap?: number;
}

export type DocumentRestoreResult =
  | { ok: true; document: IDocument }
  | { ok: false; code: 'not_found' };

export interface DocumentListResult {
  items: IDocumentLean[];
}
