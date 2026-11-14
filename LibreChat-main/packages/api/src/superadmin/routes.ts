import { logger } from '@librechat/data-schemas';
import { Router as ExpressRouter } from 'express';
import { SUPER_ADMIN_DEFAULT_PAGE_SIZE, superAdminQuerySchema } from 'librechat-data-provider';
import type {
  TSuperAdminAccess,
  TSuperAdminConversationsResponse,
  TSuperAdminDocumentDetail,
  TSuperAdminDocumentsResponse,
  TSuperAdminMessagesResponse,
  TSuperAdminOverview,
  TSuperAdminRange,
  TSuperAdminUsersResponse,
} from 'librechat-data-provider';
import type { SuperAdminMethods } from '@librechat/data-schemas';
import type { Request, Response, Router, RequestHandler } from 'express';
import { getSafeErrorMetadata } from '~/utils/errors';
import { createSuperAdminUserHandlers } from './users';
import type { SuperAdminUserMethods } from './users';

/** endowGPT superadmin portal: deployment-wide, read-only token usage and
 *  chat history. The CJS wiring in `api/server/routes/superadmin.js` mounts
 *  this router behind JWT auth and `access:admin`; behavior stays here. */

export interface SuperAdminRouterDeps {
  methods: SuperAdminMethods;
  /** User management backing store, injected so this module stays storage-agnostic. */
  users: SuperAdminUserMethods;
  /** `manage:users` gate for the write routes; omitted only in unit tests. */
  requireManageUsers?: RequestHandler;
}

type SuperAdminRequest = Request & {
  user?: { id?: string; tenantId?: string };
};

const RANGE_DAYS: Record<Exclude<TSuperAdminRange, 'all'>, number> = {
  '24h': 1,
  '7d': 7,
  '30d': 30,
};
const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_SEARCH_LENGTH = 2;
/** User and conversation ids are Mongo ObjectIds; a malformed one is a client
 *  mistake, not an empty result set. */
const OBJECT_ID = /^[a-f\d]{24}$/i;

function resolveRange(range: TSuperAdminRange): { from: Date; to: Date } {
  const to = new Date();
  if (range === 'all') {
    return { from: new Date(0), to };
  }
  return { from: new Date(to.getTime() - RANGE_DAYS[range] * DAY_MS), to };
}

function normalizeSearch(value: string | undefined): string {
  const search = value?.trim() ?? '';
  return search.length >= MIN_SEARCH_LENGTH ? search : '';
}

function pagination(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    pages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function tenantOf(req: SuperAdminRequest): string | undefined {
  const tenantId = req.user?.tenantId;
  return typeof tenantId === 'string' && tenantId.length > 0 ? tenantId : undefined;
}

function queryOf(req: SuperAdminRequest) {
  return superAdminQuerySchema.safeParse(req.query ?? {});
}

export function createSuperAdminRouter({
  methods,
  users,
  requireManageUsers,
}: SuperAdminRouterDeps): Router {
  const router = ExpressRouter();
  const userHandlers = createSuperAdminUserHandlers(users);
  const manageUsers: RequestHandler[] = requireManageUsers ? [requireManageUsers] : [];

  router.get('/access', (_req: SuperAdminRequest, res: Response<TSuperAdminAccess>) => {
    /** Reaching this handler proves the router's `requireCapability` gate passed. */
    res.status(200).json({ access: true });
  });

  router.get('/overview', async (req: SuperAdminRequest, res: Response) => {
    const parsed = queryOf(req);
    if (!parsed.success) {
      return void res.status(400).json({ error: 'invalid_query' });
    }
    try {
      const { from, to } = resolveRange(parsed.data.range);
      const overview: TSuperAdminOverview = await methods.getSuperAdminOverview({
        from,
        to,
        tenantId: tenantOf(req),
      });
      return void res.status(200).json(overview);
    } catch (error) {
      logger.error('[superadmin] overview failed:', getSafeErrorMetadata(error));
      return void res.status(500).json({ error: 'superadmin_overview_failed' });
    }
  });

  router.get('/users', async (req: SuperAdminRequest, res: Response) => {
    const parsed = queryOf(req);
    if (!parsed.success) {
      return void res.status(400).json({ error: 'invalid_query' });
    }
    const page = parsed.data.page ?? 1;
    const pageSize = parsed.data.pageSize ?? SUPER_ADMIN_DEFAULT_PAGE_SIZE;
    try {
      const { from, to } = resolveRange(parsed.data.range);
      const result = await methods.getSuperAdminUsers({
        from,
        to,
        tenantId: tenantOf(req),
        page,
        pageSize,
        search: normalizeSearch(parsed.data.search),
        sort: parsed.data.sort,
      });
      const response: TSuperAdminUsersResponse = {
        users: result.users,
        ...pagination(page, pageSize, result.total),
      };
      return void res.status(200).json(response);
    } catch (error) {
      logger.error('[superadmin] users failed:', getSafeErrorMetadata(error));
      return void res.status(500).json({ error: 'superadmin_users_failed' });
    }
  });

  router.post('/users', ...manageUsers, (req, res) => void userHandlers.createUser(req, res));

  router.patch(
    '/users/:userId/role',
    ...manageUsers,
    (req, res) => void userHandlers.updateUserRole(req, res),
  );

  router.get('/users/:userId/conversations', async (req: SuperAdminRequest, res: Response) => {
    const parsed = queryOf(req);
    if (!parsed.success) {
      return void res.status(400).json({ error: 'invalid_query' });
    }
    const userId = req.params.userId;
    if (typeof userId !== 'string' || !OBJECT_ID.test(userId)) {
      return void res.status(400).json({ error: 'invalid_user' });
    }
    const page = parsed.data.page ?? 1;
    const pageSize = parsed.data.pageSize ?? SUPER_ADMIN_DEFAULT_PAGE_SIZE;
    try {
      const result = await methods.getSuperAdminConversations({
        userId,
        tenantId: tenantOf(req),
        page,
        pageSize,
        search: normalizeSearch(parsed.data.search),
      });
      const response: TSuperAdminConversationsResponse = {
        conversations: result.conversations,
        ...pagination(page, pageSize, result.total),
      };
      return void res.status(200).json(response);
    } catch (error) {
      logger.error('[superadmin] conversations failed:', getSafeErrorMetadata(error));
      return void res.status(500).json({ error: 'superadmin_conversations_failed' });
    }
  });

  router.get('/documents', async (req: SuperAdminRequest, res: Response) => {
    const parsed = queryOf(req);
    if (!parsed.success) {
      return void res.status(400).json({ error: 'invalid_query' });
    }
    const page = parsed.data.page ?? 1;
    const pageSize = parsed.data.pageSize ?? SUPER_ADMIN_DEFAULT_PAGE_SIZE;
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;
    if (userId != null && !OBJECT_ID.test(userId)) {
      return void res.status(400).json({ error: 'invalid_user' });
    }
    try {
      const result = await methods.getSuperAdminDocuments({
        tenantId: tenantOf(req),
        page,
        pageSize,
        search: normalizeSearch(parsed.data.search),
        userId,
      });
      const response: TSuperAdminDocumentsResponse = {
        documents: result.documents,
        ...pagination(page, pageSize, result.total),
      };
      return void res.status(200).json(response);
    } catch (error) {
      logger.error('[superadmin] documents failed:', getSafeErrorMetadata(error));
      return void res.status(500).json({ error: 'superadmin_documents_failed' });
    }
  });

  router.get(
    '/documents/:userId/:conversationId/:artifactId',
    async (req: SuperAdminRequest, res: Response) => {
      const { userId, conversationId, artifactId } = req.params;
      if (
        typeof userId !== 'string' ||
        typeof conversationId !== 'string' ||
        typeof artifactId !== 'string' ||
        userId.length === 0 ||
        conversationId.length === 0 ||
        artifactId.length === 0
      ) {
        return void res.status(400).json({ error: 'invalid_document' });
      }
      try {
        const document: TSuperAdminDocumentDetail | null = await methods.getSuperAdminDocument({
          userId,
          conversationId,
          artifactId,
          tenantId: tenantOf(req),
        });
        if (document == null) {
          return void res.status(404).json({ error: 'document_not_found' });
        }
        return void res.status(200).json(document);
      } catch (error) {
        logger.error('[superadmin] document failed:', getSafeErrorMetadata(error));
        return void res.status(500).json({ error: 'superadmin_document_failed' });
      }
    },
  );

  router.get(
    '/conversations/:conversationId/messages',
    async (req: SuperAdminRequest, res: Response) => {
      const parsed = queryOf(req);
      if (!parsed.success) {
        return void res.status(400).json({ error: 'invalid_query' });
      }
      const conversationId = req.params.conversationId;
      const userId = typeof req.query.userId === 'string' ? req.query.userId : '';
      if (
        typeof conversationId !== 'string' ||
        conversationId.length === 0 ||
        !OBJECT_ID.test(userId)
      ) {
        return void res.status(400).json({ error: 'invalid_conversation' });
      }
      const page = parsed.data.page ?? 1;
      const pageSize = parsed.data.pageSize ?? SUPER_ADMIN_DEFAULT_PAGE_SIZE;
      try {
        const result = await methods.getSuperAdminMessages({
          conversationId,
          userId,
          tenantId: tenantOf(req),
          page,
          pageSize,
        });
        if (result == null) {
          return void res.status(404).json({ error: 'conversation_not_found' });
        }
        const response: TSuperAdminMessagesResponse = {
          conversationId,
          messages: result.messages,
          ...pagination(page, pageSize, result.total),
        };
        return void res.status(200).json(response);
      } catch (error) {
        logger.error('[superadmin] messages failed:', getSafeErrorMetadata(error));
        return void res.status(500).json({ error: 'superadmin_messages_failed' });
      }
    },
  );

  return router;
}
