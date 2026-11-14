const express = require('express');
const { createSuperAdminRouter } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const adminAuditLog = require('./admin/audit');
const db = require('~/models');

const router = express.Router();

/**
 * endowGPT superadmin portal. This file stays wiring-only: behavior lives in
 * `packages/api/src/superadmin` and the aggregation queries in
 * `packages/data-schemas` (see AGENTS.md module boundaries). Every route is
 * read-only and gated by the deployment's `access:admin` capability.
 */
router.use(
  requireJwtAuth,
  requireCapability(SystemCapabilities.ACCESS_ADMIN),
  createSuperAdminRouter({
    methods: {
      getSuperAdminOverview: db.getSuperAdminOverview,
      getSuperAdminUsers: db.getSuperAdminUsers,
      getSuperAdminConversations: db.getSuperAdminConversations,
      getSuperAdminMessages: db.getSuperAdminMessages,
      getSuperAdminDocuments: db.getSuperAdminDocuments,
      getSuperAdminDocument: db.getSuperAdminDocument,
    },
  }),
);

/** Audit is the existing read-only admin audit surface, reused under the portal
 *  so the portal does not duplicate pagination/filter/chain logic. */
router.use('/audit', adminAuditLog);

module.exports = router;
