import { Schema } from 'mongoose';
import type { IDocument, IDocumentVersion } from '~/types/document';

/** One endowGPT document artifact, per (user, conversationId, artifactId).
 *  The canonical Markdown lives in `content`; `versions` carries rolling
 *  snapshots for the editor's history drawer, capped by
 *  `documents.versionHistoryCap` (service responsibility, not the schema's). */
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

/**
 * Rolling snapshots: ordered oldest→newest is safe because the writer
 * (DocumentService) controls pruning and pass-through bounds; `lastVersionId`
 * marks the newest for conflict checks, so a plain rename cannot crash the
 * version list that the drawer shows.
 */
documentSchema.virtual('newestVersion').get(function (this: IDocument) {
  const versions = this.versions ?? [];
  return versions.length > 0
    ? versions[versions.length - 1]
    : (undefined as IDocumentVersion | undefined);
});

export default documentSchema;
