const express = require('express');
const { SystemRoles } = require('librechat-data-provider');
const { createSuperAdminRouter, hashSecret } = require('@librechat/api');
const { SystemCapabilities } = require('@librechat/data-schemas');
const { requireCapability } = require('~/server/middleware/roles/capabilities');
const { requireJwtAuth } = require('~/server/middleware');
const adminAuditLog = require('./admin/audit');
const db = require('~/models');

const router = express.Router();

/**
 * endowGPT superadmin portal. This file stays wiring-only: behavior lives in
 * `packages/api/src/superadmin` and the aggregation queries in
 * `packages/data-schemas` (see AGENTS.md module boundaries).
 *
 * Access is deliberately narrow: every route requires the `access:admin`
 * capability AND the ADMIN system role, and the two write routes additionally
 * require `manage:users`. A custom role that happens to hold `access:admin`
 * still cannot enter the admin portal.
 */
const requireAdminRole = (req, res, next) => {
  if (req.user?.role !== SystemRoles.ADMIN) {
    return res.status(403).json({ error: 'admin_role_required' });
  }
  next();
};

router.use(
  requireJwtAuth,
  requireCapability(SystemCapabilities.ACCESS_ADMIN),
  requireAdminRole,
  createSuperAdminRouter({
    methods: {
      getSuperAdminOverview: db.getSuperAdminOverview,
      getSuperAdminUsers: db.getSuperAdminUsers,
      getSuperAdminConversations: db.getSuperAdminConversations,
      getSuperAdminMessages: db.getSuperAdminMessages,
      getSuperAdminDocuments: db.getSuperAdminDocuments,
      getSuperAdminDocument: db.getSuperAdminDocument,
    },
    users: {
      findUser: db.findUser,
      countUsers: db.countUsers,
      updateUser: db.updateUser,
      createUser: db.createUser,
      hashPassword: hashSecret,
    },
    requireManageUsers: requireCapability(SystemCapabilities.MANAGE_USERS),
  }),
);

/** Audit is the existing read-only admin audit surface, reused under the portal
 *  so the portal does not duplicate pagination/filter/chain logic. */
router.use('/audit', adminAuditLog);

module.exports = router;
