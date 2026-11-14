import { Schema } from 'mongoose';
import type { IDocument } from '~/types/document';

/** One endowGPT document artifact, per (user, conversationId, artifactId).
 *  The canonical Markdown lives in `content`; snapshots live in the
 *  `documentversions` collection so a save never rewrites history. */
const documentSchema: Schema<IDocument> = new Schema(
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
    title: {
      type: String,
      required: true,
      maxlength: 300,
    },
    content: {
      type: String,
      required: true,
    },
    lastVersionId: {
      type: String,
    },
    /** Snapshot count, kept in step by the writer so the list needs no join. */
    versionCount: {
      type: Number,
      default: 0,
    },
    /** UTF-8 length of `content`; lets quota accounting and deletes avoid
     *  re-reading the body. */
    contentBytes: {
      type: Number,
    },
    /** Embedded snapshots written before the `documentversions` split. Read
     *  only: the writer imports them and unsets the field on the next save.
     *  `select: false` keeps the bodies out of ordinary reads. */
    versions: {
      type: [
        {
          id: { type: String, required: true },
          title: { type: String, required: true },
          content: { type: String, required: true },
          createdAt: { type: Number, required: true },
          source: { type: String, default: 'user' },
          _id: false,
        },
      ],
      default: undefined,
      select: false,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

/** One doc per (user, conversationId, artifactId): the unique index makes
 *  upserts idempotent, matching how the editor handles one artifact again and
 *  again. Like favorites, `tenantId` stays out — user ObjectIds are globally
 *  unique and tenant-scoped reads ride the same user-prefixed index. */
documentSchema.index({ user: 1, conversationId: 1, artifactId: 1 }, { unique: true });
/** Recent documents first for the /documents list and the editor lookup. */
documentSchema.index({ user: 1, updatedAt: -1 });

export default documentSchema;
