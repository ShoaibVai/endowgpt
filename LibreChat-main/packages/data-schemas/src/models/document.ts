import { Model, Schema } from 'mongoose';
import type { IDocument } from '~/types/document';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import documentSchema from '~/schema/document';

export function createDocumentModel(mongoose: typeof import('mongoose')): Model<IDocument> {
  applyTenantIsolation(documentSchema);
  return (
    mongoose.models.Document || mongoose.model<IDocument>('Document', documentSchema)
  );
}
