import { Schema } from 'mongoose';
import type { IDocumentVersionRecord } from '~/types/document';

/** One rolling snapshot of a document artifact. Kept out of the document row
 *  so a save writes a small insert instead of rewriting every historical body;
 *  the writer prunes beyond `documents.versionHistoryCap`. */
const documentVersionSchema: Schema<IDocumentVersionRecord> = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    conversationId: {
      type: String,
      required: true,
    },
    artifactId: {
      type: String,
      required: true,
    },
    /** Writer-generated snapshot id (`lastVersionId` points at the newest). */
    id: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    /** Epoch milliseconds, matching the wire format the editor consumes. */
    createdAt: {
      type: Number,
      required: true,
    },
    source: {
      type: String,
      default: 'user',
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { versionKey: false },
);

/** Snapshot ids are unique per document; this also makes legacy imports and
 *  retried writes idempotent. */
documentVersionSchema.index({ user: 1, conversationId: 1, artifactId: 1, id: 1 }, { unique: true });
/** Ordered reads for the versions drawer, restore lookup and pruning. */
documentVersionSchema.index({ user: 1, conversationId: 1, artifactId: 1, createdAt: 1 });

export default documentVersionSchema;
