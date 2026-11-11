import express from 'express';
import type { DocumentMethods } from '@librechat/data-schemas';
import type { AddressInfo } from 'node:net';
import type { AiEditInput, AiEditResult } from './aiEdit';
import type { DocumentsLimits } from './routes';
import { createDocumentsRouter } from './routes';

/** HTTP contract for `/api/documents` (PLAN.md §7.1, §10): auth is required,
 *  validation maps to coded 4xx responses, a stale base becomes 409 with the
 *  current document, and provider failures surface as stable codes. Storage
 *  semantics themselves are covered by data-schemas' `document.spec.ts`; here
 *  the router is exercised with a stub that returns the same shapes. */

type StubVersion = {
  id: string;
  title: string;
  content: string;
  createdAt: number | Date;
  source: string;
};

type StubDocument = {
  artifactId: string;
  conversationId: string;
  title: string;
  content: string;
  createdAt: number | Date;
  updatedAt: number | Date;
  lastVersionId?: string;
  versions: StubVersion[];
};

const DAY = 24 * 60 * 60 * 1000;
const CREATED = Date.parse('2026-01-01T00:00:00Z');

function makeDocument(overrides: Partial<StubDocument> = {}): StubDocument {
  const version: StubVersion = {
    id: 'version-1',
    title: 'Draft',
    content: '# Hello',
    createdAt: CREATED,
    source: 'user',
  };
  return {
    artifactId: 'artifact-1',
    conversationId: 'convo-1',
    title: 'Draft',
    content: '# Hello',
    createdAt: CREATED,
    updatedAt: CREATED + DAY,
    lastVersionId: version.id,
    versions: [version],
    ...overrides,
  };
}

const defaultLimits: DocumentsLimits = {
  aiEditMaxChars: 20000,
  aiEditMaxPerHour: 30,
  importMaxChars: 200000,
  versionHistoryCap: 50,
  autosaveDelayMs: 800,
  allowedAiEditModels: ['model-a'],
};

interface MethodStubs {
  getDocuments: jest.Mock;
  getDocument: jest.Mock;
  upsertDocument: jest.Mock;
  getDocumentVersion: jest.Mock;
  restoreDocumentVersion: jest.Mock;
  deleteDocument: jest.Mock;
  deleteUserDocuments: jest.Mock;
}

function methodStubs(): { methods: DocumentMethods; stubs: MethodStubs } {
  const stubs: MethodStubs = {
    getDocuments: jest.fn(async () => []),
    getDocument: jest.fn(async () => null),
    upsertDocument: jest.fn(async () => ({ ok: true, document: makeDocument() })),
    getDocumentVersion: jest.fn(async () => null),
    restoreDocumentVersion: jest.fn(async () => ({ ok: false, code: 'not_found' })),
    deleteDocument: jest.fn(async () => false),
    deleteUserDocuments: jest.fn(async () => 0),
  };
  // The route only calls these methods; the cast keeps the lean test fixtures
  // from having to carry Mongoose document internals.
  return { methods: stubs as unknown as DocumentMethods, stubs };
}

interface AppOptions {
  methods: DocumentMethods;
  aiEdit?: (input: AiEditInput) => Promise<AiEditResult>;
  user?: string | null;
  limits?: Partial<DocumentsLimits>;
}

interface TestApp {
  baseUrl: string;
  close: () => Promise<void>;
}

async function startApp(options: AppOptions): Promise<TestApp> {
  const app = express();
  const limits: DocumentsLimits = { ...defaultLimits, ...options.limits };
  const user = options.user === null ? undefined : { id: options.user ?? 'user-a' };

  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { user });
    next();
  });
  app.use(
    '/api/documents',
    createDocumentsRouter({
      documentMethods: options.methods,
      getLimits: () => limits,
      aiEdit: options.aiEdit,
    }),
  );

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}/api/documents`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error != null ? reject(error) : resolve()));
      }),
  };
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function postJson(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function putJson(body: unknown): RequestInit {
  return { ...postJson(body), method: 'PUT' };
}

const aiEditBody = {
  text: 'hello world',
  instruction: 'improve it',
  model: 'model-a',
  mode: 'improve',
};

describe('GET /api/documents', () => {
  test('rejects unauthenticated requests', async () => {
    const { methods } = methodStubs();
    const app = await startApp({ methods, user: null });
    try {
      const response = await fetch(app.baseUrl);
      expect(response.status).toBe(401);
      expect(await readJson(response)).toEqual({ error: 'unauthorized' });
    } finally {
      await app.close();
    }
  });

  test('maps stored rows to summaries', async () => {
    const { methods, stubs } = methodStubs();
    stubs.getDocuments.mockResolvedValue([
      {
        artifactId: 'artifact-1',
        conversationId: 'convo-1',
        title: 'Draft',
        updatedAt: CREATED,
        versionCount: 3,
      },
    ]);
    const app = await startApp({ methods });
    try {
      const response = await fetch(app.baseUrl);
      expect(response.status).toBe(200);
      expect(await readJson(response)).toEqual([
        {
          artifactId: 'artifact-1',
          conversationId: 'convo-1',
          title: 'Draft',
          updatedAt: CREATED,
          versionCount: 3,
        },
      ]);
    } finally {
      await app.close();
    }
  });

  test('hides storage failures behind a coded 500', async () => {
    const { methods, stubs } = methodStubs();
    stubs.getDocuments.mockRejectedValue(new Error('mongo down'));
    const app = await startApp({ methods });
    try {
      const response = await fetch(app.baseUrl);
      expect(response.status).toBe(500);
      expect(await readJson(response)).toEqual({ error: 'document_list_failed' });
    } finally {
      await app.close();
    }
  });
});

describe('GET /api/documents/:conversationId/:artifactId', () => {
  test('returns the wire document with epoch timestamps and a version id', async () => {
    const { methods, stubs } = methodStubs();
    stubs.getDocument.mockResolvedValue(
      makeDocument({
        createdAt: new Date(CREATED),
        updatedAt: new Date(CREATED + DAY),
        lastVersionId: undefined,
      }),
    );
    const app = await startApp({ methods });
    try {
      const response = await fetch(`${app.baseUrl}/convo-1/artifact-1`);
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        artifactId: 'artifact-1',
        conversationId: 'convo-1',
        title: 'Draft',
        content: '# Hello',
        createdAt: CREATED,
        updatedAt: CREATED + DAY,
        versionId: 'version-1',
      });
    } finally {
      await app.close();
    }
  });

  test('returns 404 for a missing document', async () => {
    const { methods } = methodStubs();
    const app = await startApp({ methods });
    try {
      const response = await fetch(`${app.baseUrl}/convo-1/artifact-1`);
      expect(response.status).toBe(404);
      expect(await readJson(response)).toEqual({ error: 'document_not_found' });
    } finally {
      await app.close();
    }
  });
});

describe('PUT /api/documents/:conversationId/:artifactId', () => {
  test('rejects an invalid payload', async () => {
    const { methods, stubs } = methodStubs();
    const app = await startApp({ methods });
    try {
      const response = await fetch(
        `${app.baseUrl}/convo-1/artifact-1`,
        putJson({ title: '', content: '# Hi' }),
      );
      expect(response.status).toBe(400);
      expect(await readJson(response)).toEqual({ error: 'invalid_document_payload' });
      expect(stubs.upsertDocument).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  test('rejects content beyond the configured import cap', async () => {
    const { methods } = methodStubs();
    const app = await startApp({ methods, limits: { importMaxChars: 4 } });
    try {
      const response = await fetch(
        `${app.baseUrl}/convo-1/artifact-1`,
        putJson({ title: 'Draft', content: '# too long' }),
      );
      expect(response.status).toBe(413);
      expect(await readJson(response)).toEqual({ error: 'document_too_large' });
    } finally {
      await app.close();
    }
  });

  test('passes the config limits to storage and returns the saved document', async () => {
    const { methods, stubs } = methodStubs();
    stubs.upsertDocument.mockResolvedValue({
      ok: true,
      document: makeDocument({ title: 'Saved', content: '# Saved' }),
    });
    const app = await startApp({ methods, limits: { versionHistoryCap: 7 } });
    try {
      const response = await fetch(
        `${app.baseUrl}/convo-1/artifact-1`,
        putJson({
          title: 'Saved',
          content: '# Saved',
          baseVersionId: 'version-0',
          versionSource: 'ai_edit',
        }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(200);
      expect(body).toMatchObject({ title: 'Saved', content: '# Saved' });
      expect(stubs.upsertDocument).toHaveBeenCalledWith({
        userId: 'user-a',
        conversationId: 'convo-1',
        artifactId: 'artifact-1',
        title: 'Saved',
        content: '# Saved',
        baseVersionId: 'version-0',
        versionSource: 'ai_edit',
        versionHistoryCap: 7,
      });
    } finally {
      await app.close();
    }
  });

  test('returns 409 with the current document when the base is stale', async () => {
    const { methods, stubs } = methodStubs();
    stubs.upsertDocument.mockResolvedValue({
      ok: false,
      code: 'conflict',
      document: makeDocument({ content: '# Current' }),
    });
    const app = await startApp({ methods });
    try {
      const response = await fetch(
        `${app.baseUrl}/convo-1/artifact-1`,
        putJson({ title: 'Draft', content: '# Mine', baseVersionId: 'stale' }),
      );
      const body = await readJson(response);

      expect(response.status).toBe(409);
      expect(body).toMatchObject({ content: '# Current', conflict: true });
    } finally {
      await app.close();
    }
  });
});

describe('DELETE /api/documents/:conversationId/:artifactId', () => {
  test('returns 204 when deleted and 404 when absent', async () => {
    const { methods, stubs } = methodStubs();
    stubs.deleteDocument.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const app = await startApp({ methods });
    try {
      const deleted = await fetch(`${app.baseUrl}/convo-1/artifact-1`, { method: 'DELETE' });
      const missing = await fetch(`${app.baseUrl}/convo-1/artifact-1`, { method: 'DELETE' });

      expect(deleted.status).toBe(204);
      expect(missing.status).toBe(404);
      expect(await readJson(missing)).toEqual({ error: 'document_not_found' });
    } finally {
      await app.close();
    }
  });
});

describe('document versions', () => {
  test('returns a snapshot or 404', async () => {
    const { methods, stubs } = methodStubs();
    stubs.getDocumentVersion.mockImplementation(async (params: { versionId: string }) =>
      params.versionId === 'version-1'
        ? { id: 'version-1', title: 'Draft', content: '# Hello', createdAt: CREATED }
        : null,
    );
    const app = await startApp({ methods });
    try {
      const found = await fetch(`${app.baseUrl}/convo-1/artifact-1/versions/version-1`);
      const missing = await fetch(`${app.baseUrl}/convo-1/artifact-1/versions/unknown`);

      expect(found.status).toBe(200);
      expect(await readJson(found)).toEqual({
        id: 'version-1',
        title: 'Draft',
        content: '# Hello',
        createdAt: CREATED,
      });
      expect(missing.status).toBe(404);
    } finally {
      await app.close();
    }
  });

  test('validates the restore payload and maps a missing version to 404', async () => {
    const { methods, stubs } = methodStubs();
    stubs.restoreDocumentVersion
      .mockResolvedValueOnce({ ok: true, document: makeDocument({ content: '# Old' }) })
      .mockResolvedValueOnce({ ok: false, code: 'not_found' });
    const app = await startApp({ methods });
    try {
      const invalid = await fetch(
        `${app.baseUrl}/convo-1/artifact-1/restore`,
        postJson({ versionId: '' }),
      );
      const restored = await fetch(
        `${app.baseUrl}/convo-1/artifact-1/restore`,
        postJson({ versionId: 'version-1' }),
      );
      const missing = await fetch(
        `${app.baseUrl}/convo-1/artifact-1/restore`,
        postJson({ versionId: 'version-9' }),
      );

      expect(invalid.status).toBe(400);
      expect(restored.status).toBe(200);
      expect(await readJson(restored)).toMatchObject({ content: '# Old' });
      expect(missing.status).toBe(404);
      expect(await readJson(missing)).toEqual({ error: 'version_not_found' });
    } finally {
      await app.close();
    }
  });
});

describe('POST /api/documents/ai-edit', () => {
  test('rejects unauthenticated requests', async () => {
    const { methods } = methodStubs();
    const app = await startApp({ methods, user: null });
    try {
      const response = await fetch(`${app.baseUrl}/ai-edit`, postJson(aiEditBody));
      expect(response.status).toBe(401);
    } finally {
      await app.close();
    }
  });

  test('rejects models outside the allow-list before calling the provider', async () => {
    const { methods } = methodStubs();
    const aiEdit = jest.fn(async () => ({ ok: true as const, text: 'x' }));
    const app = await startApp({ methods, aiEdit });
    try {
      const response = await fetch(
        `${app.baseUrl}/ai-edit`,
        postJson({ ...aiEditBody, model: 'model-z' }),
      );
      expect(response.status).toBe(400);
      expect(await readJson(response)).toEqual({ error: 'ai_edit_model_not_allowed' });
      expect(aiEdit).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  test('rejects selections beyond the configured cap', async () => {
    const { methods } = methodStubs();
    const aiEdit = jest.fn(async () => ({ ok: true as const, text: 'x' }));
    const app = await startApp({ methods, aiEdit, limits: { aiEditMaxChars: 4 } });
    try {
      const response = await fetch(`${app.baseUrl}/ai-edit`, postJson(aiEditBody));
      expect(response.status).toBe(413);
      expect(await readJson(response)).toEqual({ error: 'ai_edit_selection_too_large' });
      expect(aiEdit).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  test('returns the replacement text', async () => {
    const { methods } = methodStubs();
    const aiEdit = jest.fn(async () => ({ ok: true as const, text: 'Hello, world.' }));
    const app = await startApp({ methods, aiEdit });
    try {
      const response = await fetch(`${app.baseUrl}/ai-edit`, postJson(aiEditBody));
      expect(response.status).toBe(200);
      expect(await readJson(response)).toEqual({ text: 'Hello, world.' });
      expect(aiEdit).toHaveBeenCalledWith({ request: expect.objectContaining(aiEditBody) });
    } finally {
      await app.close();
    }
  });

  test('maps provider failures to their stable code and status', async () => {
    const { methods } = methodStubs();
    const aiEdit = jest.fn(async () => ({
      ok: false as const,
      code: 'ai_edit_rate_limited' as const,
      status: 429,
    }));
    const app = await startApp({ methods, aiEdit });
    try {
      const response = await fetch(`${app.baseUrl}/ai-edit`, postJson(aiEditBody));
      expect(response.status).toBe(429);
      expect(await readJson(response)).toEqual({ error: 'ai_edit_rate_limited' });
    } finally {
      await app.close();
    }
  });

  test('maps an unexpected provider throw to 502 without leaking it', async () => {
    const { methods } = methodStubs();
    const aiEdit = jest.fn(async () => {
      throw new Error('socket hang up');
    });
    const app = await startApp({ methods, aiEdit });
    try {
      const response = await fetch(`${app.baseUrl}/ai-edit`, postJson(aiEditBody));
      expect(response.status).toBe(502);
      expect(await readJson(response)).toEqual({ error: 'ai_edit_unavailable' });
    } finally {
      await app.close();
    }
  });

  test('enforces the per-user hourly budget', async () => {
    const { methods } = methodStubs();
    const aiEdit = jest.fn(async () => ({ ok: true as const, text: 'x' }));
    const app = await startApp({ methods, aiEdit, limits: { aiEditMaxPerHour: 1 } });
    try {
      const first = await fetch(`${app.baseUrl}/ai-edit`, postJson(aiEditBody));
      const second = await fetch(`${app.baseUrl}/ai-edit`, postJson(aiEditBody));

      expect(first.status).toBe(200);
      expect(second.status).toBe(429);
      expect(await readJson(second)).toEqual({ error: 'ai_edit_rate_limited' });
      expect(aiEdit).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
