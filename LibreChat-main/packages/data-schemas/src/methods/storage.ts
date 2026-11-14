import { FileContext } from 'librechat-data-provider';
import type { Model } from 'mongoose';
import type { IStorageUsage } from '~/schema/storageUsage';

/**
 * Per-user storage accounting shared by the document editor and generated files.
 *
 * Only data the user can remove counts: each document's current Markdown and
 * files carrying `metadata.generatedFile`. Version snapshots are backups the
 * editor prunes on its own, and temporary uploads expire through their TTL, so
 * neither contributes to the cap.
 *
 * Document bytes live in a counter row updated with atomic `$inc` operations:
 * the quota check reserves growth before the write, so two concurrent saves
 * cannot both pass. Generated-file bytes are summed from their own records,
 * which already carry `bytes` and are indexed by owner.
 */

export type UserStorageUsage = {
  usedBytes: number;
  documentBytes: number;
  generatedFileBytes: number;
};

/** Reserve succeeds, or reports the usage that made the request exceed the cap. */
export type ReserveStorageResult = { ok: true } | { ok: false; usage: UserStorageUsage };

export interface StorageMethods {
  getUserStorageUsage: (params: { userId: string }) => Promise<UserStorageUsage>;
  reserveDocumentStorage: (params: {
    userId: string;
    bytes: number;
    limit: number;
  }) => Promise<ReserveStorageResult>;
  releaseDocumentStorage: (params: { userId: string; bytes: number }) => Promise<void>;
}

type ByteTotal = {
  _id: null;
  bytes: number;
};

function requireOwner(mongoose: typeof import('mongoose'), userId: string) {
  if (!mongoose.isObjectIdOrHexString(userId)) {
    throw new Error('A valid user id is required to measure document storage');
  }
  return new mongoose.Types.ObjectId(userId);
}

export function createStorageMethods(mongoose: typeof import('mongoose')): StorageMethods {
  const Usages = () => mongoose.models.StorageUsage as Model<IStorageUsage>;

  async function generatedFileBytes(owner: import('mongoose').Types.ObjectId): Promise<number> {
    const rows = await mongoose.models.File.aggregate<ByteTotal>([
      {
        $match: {
          user: owner,
          context: FileContext.message_attachment,
          'metadata.generatedFile': { $exists: true },
        },
      },
      { $group: { _id: null, bytes: { $sum: '$bytes' } } },
    ]);
    return rows[0]?.bytes ?? 0;
  }

  /** Reads the counter, seeding it from stored content the first time so an
   *  existing deployment needs no migration step. */
  async function documentBytes(owner: import('mongoose').Types.ObjectId): Promise<number> {
    const existing = await Usages()
      .findOne({ user: owner })
      .select('documentBytes')
      .lean<{ documentBytes?: number } | null>();
    if (existing?.documentBytes != null) {
      return Math.max(0, existing.documentBytes);
    }

    const rows = await mongoose.models.Document.aggregate<ByteTotal>([
      { $match: { user: owner } },
      { $group: { _id: null, bytes: { $sum: { $strLenBytes: '$content' } } } },
    ]);
    const computed = rows[0]?.bytes ?? 0;
    const seeded = await Usages()
      .findOneAndUpdate(
        { user: owner },
        { $setOnInsert: { user: owner, documentBytes: computed } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .select('documentBytes')
      .lean<{ documentBytes?: number } | null>();
    return Math.max(0, seeded?.documentBytes ?? computed);
  }

  async function getUserStorageUsage({ userId }: { userId: string }): Promise<UserStorageUsage> {
    const owner = requireOwner(mongoose, userId);
    const [docBytes, fileBytes] = await Promise.all([
      documentBytes(owner),
      generatedFileBytes(owner),
    ]);

    return {
      usedBytes: docBytes + fileBytes,
      documentBytes: docBytes,
      generatedFileBytes: fileBytes,
    };
  }

  async function reserveDocumentStorage({
    userId,
    bytes,
    limit,
  }: {
    userId: string;
    bytes: number;
    limit: number;
  }): Promise<ReserveStorageResult> {
    if (bytes <= 0) {
      return { ok: true };
    }
    const owner = requireOwner(mongoose, userId);
    /** Seeding first guarantees the conditional increment runs against a real
     *  counter; the update itself is the atomic gate. */
    const [fileBytes, docBytes] = await Promise.all([
      generatedFileBytes(owner),
      documentBytes(owner),
    ]);
    const documentCap = limit - fileBytes;
    if (docBytes + bytes > documentCap) {
      return { ok: false, usage: await getUserStorageUsage({ userId }) };
    }

    const reserved = await Usages()
      .findOneAndUpdate(
        { user: owner, documentBytes: { $lte: documentCap - bytes } },
        { $inc: { documentBytes: bytes } },
        { new: true },
      )
      .lean<{ documentBytes?: number } | null>();
    if (reserved == null) {
      return { ok: false, usage: await getUserStorageUsage({ userId }) };
    }
    return { ok: true };
  }

  async function releaseDocumentStorage({
    userId,
    bytes,
  }: {
    userId: string;
    bytes: number;
  }): Promise<void> {
    if (bytes <= 0) {
      return;
    }
    const owner = requireOwner(mongoose, userId);
    await Usages().updateOne({ user: owner }, { $inc: { documentBytes: -bytes } });
  }

  return { getUserStorageUsage, reserveDocumentStorage, releaseDocumentStorage };
}
