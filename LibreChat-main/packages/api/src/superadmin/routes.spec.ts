import express from 'express';
import type {
  TSuperAdminConversationsResponse,
  TSuperAdminMessagesResponse,
  TSuperAdminOverview,
  TSuperAdminUsersResponse,
} from 'librechat-data-provider';
import type { SuperAdminMethods } from '@librechat/data-schemas';
import type { AddressInfo } from 'node:net';
import { createSuperAdminRouter } from './routes';
import type { SuperAdminUserMethods } from './users';

/** HTTP contract for `/api/superadmin`: query validation, pagination, and
 *  coded failures. Storage semantics are covered by data-schemas'
 *  `superadmin.spec.ts`; here the router is exercised with stub methods. */

const CREATED = '2026-01-01T00:00:00.000Z';
/** A real-shaped owner id: the router rejects anything that is not an ObjectId. */
const USER_ID = '64b000000000000000000001';

const overview: TSuperAdminOverview = {
  totals: {
    users: 2,
    activeUsers: 1,
    conversations: 3,
    messages: 4,
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    tokenSource: 'transactions',
  },
  daily: [
    {
      date: '2026-01-01',
      conversations: 3,
      messages: 4,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    },
  ],
  models: [
    {
      model: 'model-a',
      messages: 4,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    },
  ],
};

const users: TSuperAdminUsersResponse = {
  users: [
    {
      userId: 'user-a',
      name: 'Alice',
      username: 'alice',
      email: 'alice@example.com',
      role: 'USER',
      createdAt: CREATED,
      lastActiveAt: CREATED,
      conversations: 2,
      messages: 3,
      promptTokens: 80,
      completionTokens: 40,
      totalTokens: 120,
    },
  ],
  page: 1,
  pageSize: 25,
  total: 1,
  pages: 1,
};

const conversations: TSuperAdminConversationsResponse = {
  conversations: [
    {
      conversationId: 'convo-1',
      title: 'Draft',
      model: 'model-a',
      createdAt: CREATED,
      updatedAt: CREATED,
      messages: 2,
      totalTokens: 20,
      archived: false,
    },
  ],
  page: 1,
  pageSize: 25,
  total: 1,
  pages: 1,
};

const messages: TSuperAdminMessagesResponse = {
  conversationId: 'convo-1',
  messages: [
    {
      messageId: 'message-1',
      isCreatedByUser: true,
      sender: 'User',
      model: 'model-a',
      text: 'Hello',
      truncated: false,
      tokenCount: 4,
      createdAt: CREATED,
    },
  ],
  page: 1,
  pageSize: 25,
  total: 1,
  pages: 1,
};

const documents = {
  userId: 'user-a',
  userName: 'Alice',
  userEmail: 'alice@example.com',
  conversationId: 'convo-1',
  artifactId: 'artifact-1',
  title: 'Project note',
  versionCount: 2,
  createdAt: CREATED,
  updatedAt: CREATED,
};

function methodStubs() {
  return {
    getSuperAdminOverview: jest.fn(async () => overview),
    getSuperAdminUsers: jest.fn(async () => ({
      users: users.users,
      total: users.total,
    })),
    getSuperAdminConversations: jest.fn(async () => ({
      conversations: conversations.conversations,
      total: conversations.total,
    })),
    getSuperAdminMessages: jest.fn(async () => ({
      messages: messages.messages,
      total: messages.total,
    })),
    getSuperAdminDocuments: jest.fn(async () => ({
      documents: [documents],
      total: 1,
    })),
    getSuperAdminDocument: jest.fn(async () => ({
      ...documents,
      content: '# Note',
      versions: [{ id: 'v1', title: 'Project note', createdAt: 1, source: 'user' }],
    })),
  };
}

async function startApp(methods: SuperAdminMethods): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  /** The user-management routes are exercised in `users.spec.ts`; this suite
   *  covers the read-only portal. */
  const userMethods: SuperAdminUserMethods = {
    findUser: async () => null,
    countUsers: async () => 0,
    updateUser: async () => null,
    createUser: async () => ({}),
    hashPassword: async () => 'hashed',
  };
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { user: { id: 'admin', tenantId: 'tenant-a' } });
    next();
  });
  app.use('/api/superadmin', createSuperAdminRouter({ methods, users: userMethods }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/api/superadmin`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error != null ? reject(error) : resolve()));
      }),
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

describe('GET /api/superadmin', () => {
  test('reports portal access to an authorized caller', async () => {
    const app = await startApp(methodStubs() as unknown as SuperAdminMethods);
    try {
      const response = await fetch(`${app.baseUrl}/access`);
      expect(response.status).toBe(200);
      expect(await readJson(response)).toEqual({ access: true });
    } finally {
      await app.close();
    }
  });

  test('parses the range and returns overview totals', async () => {
    const methods = methodStubs();
    const app = await startApp(methods as unknown as SuperAdminMethods);
    try {
      const response = await fetch(`${app.baseUrl}/overview?range=7d`);
      expect(response.status).toBe(200);
      expect(await readJson(response)).toEqual(overview);
      expect(methods.getSuperAdminOverview).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-a',
          from: expect.any(Date),
          to: expect.any(Date),
        }),
      );
    } finally {
      await app.close();
    }
  });

  test('rejects an unknown range', async () => {
    const app = await startApp(methodStubs() as unknown as SuperAdminMethods);
    try {
      const response = await fetch(`${app.baseUrl}/overview?range=90d`);
      expect(response.status).toBe(400);
      expect(await readJson(response)).toEqual({ error: 'invalid_query' });
    } finally {
      await app.close();
    }
  });

  test('rejects a page beyond the portal bound', async () => {
    const app = await startApp(methodStubs() as unknown as SuperAdminMethods);
    try {
      const response = await fetch(`${app.baseUrl}/users?page=100000`);
      expect(response.status).toBe(400);
      expect(await readJson(response)).toEqual({ error: 'invalid_query' });
    } finally {
      await app.close();
    }
  });

  test('normalizes search and applies page defaults', async () => {
    const methods = methodStubs();
    const app = await startApp(methods as unknown as SuperAdminMethods);
    try {
      const response = await fetch(`${app.baseUrl}/users?range=30d&search=a&page=2&pageSize=10`);
      expect(response.status).toBe(200);
      const body = (await readJson(response)) as unknown as TSuperAdminUsersResponse;
      expect(body.page).toBe(2);
      expect(body.pageSize).toBe(10);
      expect(methods.getSuperAdminUsers).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          pageSize: 10,
          search: '',
          sort: undefined,
        }),
      );
    } finally {
      await app.close();
    }
  });

  test('returns conversations for a user', async () => {
    const methods = methodStubs();
    const app = await startApp(methods as unknown as SuperAdminMethods);
    try {
      const response = await fetch(`${app.baseUrl}/users/${USER_ID}/conversations?range=30d`);
      expect(response.status).toBe(200);
      expect(await readJson(response)).toEqual(conversations);
      expect(methods.getSuperAdminConversations).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID, tenantId: 'tenant-a', page: 1, pageSize: 25 }),
      );
    } finally {
      await app.close();
    }
  });

  test('returns documents and their full content', async () => {
    const methods = methodStubs();
    const app = await startApp(methods as unknown as SuperAdminMethods);
    try {
      const list = await fetch(`${app.baseUrl}/documents?range=30d`);
      expect(list.status).toBe(200);
      const body = (await readJson(list)) as unknown as Record<string, unknown>;
      expect(body).toMatchObject({ page: 1, pageSize: 25, total: 1, pages: 1 });
      expect((body.documents as Array<Record<string, unknown>>)[0]).toMatchObject({
        artifactId: 'artifact-1',
      });

      const detail = await fetch(`${app.baseUrl}/documents/user-a/convo-1/artifact-1`);
      expect(detail.status).toBe(200);
      expect(await readJson(detail)).toMatchObject({ content: '# Note', title: 'Project note' });
    } finally {
      await app.close();
    }
  });

  test('rejects a malformed owner id instead of widening the query', async () => {
    const methods = methodStubs();
    const app = await startApp(methods as unknown as SuperAdminMethods);
    try {
      const docs = await fetch(`${app.baseUrl}/documents?userId=not-an-id`);
      expect(docs.status).toBe(400);
      expect(await readJson(docs)).toEqual({ error: 'invalid_user' });
      expect(methods.getSuperAdminDocuments).not.toHaveBeenCalled();

      const convos = await fetch(`${app.baseUrl}/users/not-an-id/conversations`);
      expect(convos.status).toBe(400);
      expect(await readJson(convos)).toEqual({ error: 'invalid_user' });
      expect(methods.getSuperAdminConversations).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  test('maps a missing document to 404', async () => {
    const methods = methodStubs();
    methods.getSuperAdminDocument.mockResolvedValueOnce(null as never);
    const app = await startApp(methods as unknown as SuperAdminMethods);
    try {
      const response = await fetch(`${app.baseUrl}/documents/user-a/convo-1/missing`);
      expect(response.status).toBe(404);
      expect(await readJson(response)).toEqual({ error: 'document_not_found' });
    } finally {
      await app.close();
    }
  });

  test('returns a conversation transcript and requires the owner', async () => {
    const methods = methodStubs();
    const app = await startApp(methods as unknown as SuperAdminMethods);
    try {
      const missingOwner = await fetch(`${app.baseUrl}/conversations/convo-1/messages`);
      expect(missingOwner.status).toBe(400);
      expect(await readJson(missingOwner)).toEqual({ error: 'invalid_conversation' });

      const response = await fetch(
        `${app.baseUrl}/conversations/convo-1/messages?userId=${USER_ID}`,
      );
      expect(response.status).toBe(200);
      expect(await readJson(response)).toEqual(messages);
      expect(methods.getSuperAdminMessages).toHaveBeenCalledWith(
        expect.objectContaining({ conversationId: 'convo-1', userId: USER_ID }),
      );
    } finally {
      await app.close();
    }
  });

  test('maps a missing conversation to 404 and a storage failure to 500', async () => {
    const methods = methodStubs();
    methods.getSuperAdminMessages.mockResolvedValueOnce(null as never);
    const app = await startApp(methods as unknown as SuperAdminMethods);
    try {
      const missing = await fetch(
        `${app.baseUrl}/conversations/convo-1/messages?userId=${USER_ID}`,
      );
      expect(missing.status).toBe(404);
      expect(await readJson(missing)).toEqual({ error: 'conversation_not_found' });

      methods.getSuperAdminOverview.mockRejectedValueOnce(new Error('mongo down'));
      const failed = await fetch(`${app.baseUrl}/overview`);
      expect(failed.status).toBe(500);
      expect(await readJson(failed)).toEqual({ error: 'superadmin_overview_failed' });
    } finally {
      await app.close();
    }
  });
});
