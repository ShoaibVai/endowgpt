import { Model } from 'mongoose';
import type { IDocumentVersionRecord } from '~/types/document';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import documentVersionSchema from '~/schema/documentVersion';

export function createDocumentVersionModel(
  mongoose: typeof import('mongoose'),
): Model<IDocumentVersionRecord> {
  applyTenantIsolation(documentVersionSchema);
  return (
    mongoose.models.DocumentVersion ||
    mongoose.model<IDocumentVersionRecord>('DocumentVersion', documentVersionSchema)
  );
}
