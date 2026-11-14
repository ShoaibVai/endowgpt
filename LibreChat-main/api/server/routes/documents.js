const express = require('express');
const { createDocumentsRouter } = require('@librechat/api');
const { requireJwtAuth, configMiddleware } = require('~/server/middleware');
const {
  getDocuments,
  getDocument,
  getDocumentVersions,
  upsertDocument,
  getDocumentVersion,
  restoreDocumentVersion,
  deleteDocument,
  getUserStorageUsage,
  reserveDocumentStorage,
  releaseDocumentStorage,
} = require('~/models');

const router = express.Router();

/**
 * endowGPT document artifacts. This file stays wiring-only: behavior lives in
 * `packages/api/src/documents` (see AGENTS.md module boundaries). The document
 * methods arrive via `~/models` and the deployment limits via `configMiddleware`
 * (`req.config.documents`, resolved by AppService from librechat.yaml).
 */
router.use(
  requireJwtAuth,
  configMiddleware,
  createDocumentsRouter({
    documentMethods: {
      getDocuments,
      getDocument,
      getDocumentVersions,
      upsertDocument,
      getDocumentVersion,
      restoreDocumentVersion,
      deleteDocument,
    },
    storageMethods: { getUserStorageUsage, reserveDocumentStorage, releaseDocumentStorage },
    getLimits: (req) => req.config?.documents,
  }),
);

module.exports = router;
