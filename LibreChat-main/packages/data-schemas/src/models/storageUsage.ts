import { Model } from 'mongoose';
import type { IStorageUsage } from '~/schema/storageUsage';
import { applyTenantIsolation } from '~/models/plugins/tenantIsolation';
import storageUsageSchema from '~/schema/storageUsage';

export function createStorageUsageModel(mongoose: typeof import('mongoose')): Model<IStorageUsage> {
  applyTenantIsolation(storageUsageSchema);
  return (
    mongoose.models.StorageUsage ||
    mongoose.model<IStorageUsage>('StorageUsage', storageUsageSchema)
  );
}
