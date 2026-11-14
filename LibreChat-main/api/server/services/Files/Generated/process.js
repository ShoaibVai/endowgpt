const { logger } = require('@librechat/data-schemas');
const { FileSources } = require('librechat-data-provider');
const { getStorageMetadata, persistGeneratedFile } = require('@librechat/api');
const { getStrategyFunctions } = require('~/server/services/Files/strategies');
const { getRetentionExpiry } = require('~/server/services/Files/retention');
const db = require('~/models');

/**
 * Builds the request-bound persistence callback used by the native
 * file-generation tools. The domain logic lives in `@librechat/api`; this
 * adapter only supplies the deployment's storage strategy and database.
 *
 * @param {object} params
 * @param {import('~/typedefs').ServerRequest} params.req
 * @param {import('@librechat/api').GeneratedFileLimits} params.limits
 * @param {string} [params.fileStrategy]
 */
function createGeneratedFilePersister({ req, limits, fileStrategy: configuredStrategy }) {
  const fileStrategy = configuredStrategy ?? req.config?.fileStrategy ?? FileSources.local;
  const storageMaxBytes = req.config?.documents?.storageMaxBytes;
  const { saveBuffer, deleteFile } = getStrategyFunctions(fileStrategy);
  if (typeof saveBuffer !== 'function') {
    throw new Error(`File storage strategy "${fileStrategy}" cannot store generated files`);
  }

  return async function persist(file) {
    const retention = await getRetentionExpiry(req);
    return persistGeneratedFile(
      {
        req,
        buffer: file.buffer,
        filename: file.filename,
        format: file.format,
        mimeType: file.mimeType,
        counts: file.counts,
        conversationId: file.conversationId,
        messageId: file.messageId,
        limits,
        storageMaxBytes,
      },
      {
        fileStrategy,
        saveBuffer,
        getStorageMetadata,
        createFile: db.createFile,
        getUserStorageUsage: db.getUserStorageUsage,
        expiredAt: retention.expiredAt ?? null,
        logger,
        deleteStored: async (stored) => {
          if (typeof deleteFile === 'function') {
            await deleteFile(req, stored);
          }
        },
      },
    );
  };
}

module.exports = {
  createGeneratedFilePersister,
};
