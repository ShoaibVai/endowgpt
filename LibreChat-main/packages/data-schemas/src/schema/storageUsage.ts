import { Schema } from 'mongoose';
import type { Types } from 'mongoose';

/** Per-user accounting for the current Markdown of every saved document.
 *  Maintained with atomic `$inc` so concurrent saves cannot both pass the
 *  quota check; generated-file bytes are summed from their own records. */
export interface IStorageUsage {
  user: Types.ObjectId;
  documentBytes: number;
  tenantId?: string;
}

const storageUsageSchema: Schema<IStorageUsage> = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    documentBytes: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
    tenantId: {
      type: String,
      index: true,
    },
  },
  { timestamps: true },
);

/** One counter per user; user ids are globally unique, so this needs no
 *  tenant prefix (matching the documents collection). */
storageUsageSchema.index({ user: 1 }, { unique: true });

export default storageUsageSchema;
