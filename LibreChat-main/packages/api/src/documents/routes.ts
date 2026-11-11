import { Router as ExpressRouter } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { documentUpsertSchema, aiEditRequestSchema } from 'librechat-data-provider';
import type {
  TDocument,
  TDocumentSummary,
  TDocumentVersionContent,
  TDocumentUpsert,
  TAiEditRequest,
  TAiEditResponse,
} from 'librechat-data-provider';
import type { DocumentMethods } from '@librechat/data-schemas';
import type { Request, Response, Router } from 'express';
import { aiEditDocumentText } from './aiEdit';

/** endowGPT document artifacts: the storage-backed HTTP surface. Handlers stay
 *  thin — validation, the storage call, and status mapping; per repo rules the
 *  behavior (allow-lists, caps, provider call) lives in this module, and the
 *  CJS wiring in `api/server/routes/documents.js` only mounts the router. */

/** Documents config as resolved by AppService (`documents` in librechat.yaml). */
export interface DocumentsLimits {
  aiEditMaxChars: number;
  aiEditMaxPerHour: number;
  importMaxChars: number;
  versionHistoryCap: number;
  autosaveDelayMs: number;
  allowedAiEditModels: string[];
}

export interface DocumentsRouterDeps {
  documentMethods: DocumentMethods;
  /** Limits resolved per request from `req.config.documents` (config middleware
   *  resolves them), so a yaml retune lands without a redeploy. */
  getLimits: (req: DocumentsRequest) => DocumentsLimits;
  aiEdit?: typeof aiEditDocumentText;
}

type RequestUser = { id?: string };
type DocumentsRequest<TBody = unknown, TParams = Record<string, string>> = Request<
  TParams,
  unknown,
  TBody
> & { user?: RequestUser };

/** Flatten a stored document (or its lean shape) to the wire shape. Timestamps
 *  arrive as Dates from Mongoose; wire values are epoch ms. */
function toWire(doc: {
  artifactId: string;
  conversationId: string;
  title: string;
  content?: string;
  createdAt?: Date | number;
  updatedAt?: Date | number;
  lastVersionId?: string;
  versions?: Array<{ id: string; title: string; createdAt: Date | number; source: string }>;
}): TDocument {
  const versions = doc.versions ?? [];
  return {
    artifactId: doc.artifactId,
    conversationId: doc.conversationId,
    title: doc.title,
    content: doc.content ?? '',
    createdAt: toMs(doc.createdAt),
    updatedAt: toMs(doc.updatedAt),
    versionId: doc.lastVersionId ?? (versions[versions.length - 1]?.id ?? ''),
    versions: versions.map((version) => ({
      id: version.id,
      title: version.title,
      createdAt: toMs(version.createdAt),
      source: version.source,
    })),
  };
}

function toMs(value: Date | number | undefined): number {
  if (value == null) {
    return 0;
  }
  return value instanceof Date ? value.getTime() : value;
}

const getUser = (req: DocumentsRequest): string | null => {
  const id = req.user?.id;
  return typeof id === 'string' && id.length > 0 ? id : null;
};

export function createDocumentsRouter(deps: DocumentsRouterDeps): Router {
  const router = ExpressRouter({ mergeParams: true });
  const { documentMethods } = deps;
  const runAiEdit = deps.aiEdit ?? aiEditDocumentText;
  /** Limits resolved from the request's config; callers already passed
   *  requireJwtAuth, so configMiddleware has attached `req.config`. */
  const limitsOf = (req: DocumentsRequest): DocumentsLimits =>
    deps.getLimits(req) ?? {
      aiEditMaxChars: 20000,
      aiEditMaxPerHour: 30,
      importMaxChars: 200000,
      versionHistoryCap: 50,
      autosaveDelayMs: 800,
      allowedAiEditModels: [],
    };

  /** Per-user hourly budget for inline edits (brief §6.4). The limit resolves
   *  from config on every request, so a yaml retune applies immediately. */
  const aiEditLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: (req) => limitsOf(req as DocumentsRequest).aiEditMaxPerHour,
    keyGenerator: (req) => {
      const userId = getUser(req as DocumentsRequest);
      return userId ?? ipKeyGenerator(req.ip ?? '0.0.0.0');
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) =>
      res.status(429).json({ error: 'ai_edit_rate_limited' }),
  });

  router.get('/', async (req: DocumentsRequest, res) => {
    const userId = getUser(req);
    if (!userId) {
      return void res.status(401).json({ error: 'unauthorized' });
    }
    try {
      const docs = await documentMethods.getDocuments(userId);
      const items: TDocumentSummary[] = (docs ?? []).map((doc) => ({
        artifactId: doc.artifactId,
        conversationId: doc.conversationId,
        title: doc.title,
        updatedAt: toMs(doc.updatedAt),
        versionCount: doc.versionCount ?? 0,
      }));
      return void res.status(200).json(items);
    } catch {
      // Storage outage: nothing about the query is safe or useful to echo.
      return void res.status(500).json({ error: 'document_list_failed' });
    }
  });

  router.get('/:conversationId/:artifactId', async (req: DocumentsRequest, res) => {
    const userId = getUser(req);
    if (!userId) {
      return void res.status(401).json({ error: 'unauthorized' });
    }
    try {
      const doc = await documentMethods.getDocument({
        userId,
        conversationId: req.params.conversationId,
        artifactId: req.params.artifactId,
      });
      if (doc == null) {
        return void res.status(404).json({ error: 'document_not_found' });
      }
      return void res.status(200).json(toWire(doc));
    } catch {
      return void res.status(500).json({ error: 'document_load_failed' });
    }
  });

  router.put('/:conversationId/:artifactId', async (req: DocumentsRequest<TDocumentUpsert>, res) => {
    const userId = getUser(req);
    if (!userId) {
      return void res.status(401).json({ error: 'unauthorized' });
    }
    const parsed = documentUpsertSchema.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json({ error: 'invalid_document_payload' });
    }
    const { title, content, baseVersionId, versionSource } = parsed.data;
    const limits = limitsOf(req);
    if (content.length > limits.importMaxChars) {
      return void res.status(413).json({ error: 'document_too_large' });
    }
    try {
      const result = await documentMethods.upsertDocument({
        userId,
        conversationId: req.params.conversationId,
        artifactId: req.params.artifactId,
        title,
        content,
        baseVersionId,
        versionSource,
        versionHistoryCap: limits.versionHistoryCap,
      });
      if (result.ok) {
        return void res.status(200).json(toWire(result.document));
      }
      // Another session advanced this document first: the current state goes
      // back with the conflict flag so the client can decide (reload or save
      // anyway). Never a raw error.
      return void res
        .status(409)
        .json({ ...toWire(result.document), conflict: true });
    } catch {
      return void res.status(500).json({ error: 'document_save_failed' });
    }
  });

  router.delete('/:conversationId/:artifactId', async (req: DocumentsRequest, res) => {
    const userId = getUser(req);
    if (!userId) {
      return void res.status(401).json({ error: 'unauthorized' });
    }
    try {
      const deleted = await documentMethods.deleteDocument({
        userId,
        conversationId: req.params.conversationId,
        artifactId: req.params.artifactId,
      });
      if (!deleted) {
        return void res.status(404).json({ error: 'document_not_found' });
      }
      return void res.status(204).send();
    } catch {
      return void res.status(500).json({ error: 'document_delete_failed' });
    }
  });

  router.get(
    '/:conversationId/:artifactId/versions/:versionId',
    async (req: DocumentsRequest, res) => {
      const userId = getUser(req);
      if (!userId) {
        return void res.status(401).json({ error: 'unauthorized' });
      }
      try {
        const version = await documentMethods.getDocumentVersion({
          userId,
          conversationId: req.params.conversationId,
          artifactId: req.params.artifactId,
          versionId: req.params.versionId,
        });
        if (version == null) {
          return void res.status(404).json({ error: 'version_not_found' });
        }
        const payload: TDocumentVersionContent = {
          id: version.id,
          title: version.title,
          createdAt: toMs(version.createdAt),
          content: version.content,
        };
        return void res.status(200).json(payload);
      } catch {
        return void res.status(500).json({ error: 'version_load_failed' });
      }
    },
  );

  router.post('/:conversationId/:artifactId/restore', async (req: DocumentsRequest, res) => {
    const userId = getUser(req);
    if (!userId) {
      return void res.status(401).json({ error: 'unauthorized' });
    }
    const versionId = (req.body as { versionId?: unknown } | undefined)?.versionId;
    if (typeof versionId !== 'string' || versionId.length === 0) {
      return void res.status(400).json({ error: 'invalid_restore_payload' });
    }
    const limits = limitsOf(req);
    try {
      const result = await documentMethods.restoreDocumentVersion({
        userId,
        conversationId: req.params.conversationId,
        artifactId: req.params.artifactId,
        versionId,
        versionHistoryCap: limits.versionHistoryCap,
      });
      if (result.ok) {
        return void res.status(200).json(toWire(result.document));
      }
      return void res.status(404).json({ error: 'version_not_found' });
    } catch {
      return void res.status(500).json({ error: 'document_restore_failed' });
    }
  });

  router.post('/ai-edit', aiEditLimiter, async (req: DocumentsRequest<TAiEditRequest>, res) => {
    const userId = getUser(req);
    if (!userId) {
      return void res.status(401).json({ error: 'unauthorized' });
    }
    const parsed = aiEditRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return void res.status(400).json({ error: 'invalid_ai_edit_payload' });
    }
    const { text, model } = parsed.data;
    const limits = limitsOf(req);
    if (!limits.allowedAiEditModels.includes(model)) {
      return void res.status(400).json({ error: 'ai_edit_model_not_allowed' });
    }
    if (text.length > limits.aiEditMaxChars) {
      return void res.status(413).json({ error: 'ai_edit_selection_too_large' });
    }
    try {
      const result = await runAiEdit({
        request: parsed.data,
      });
      if (!result.ok) {
        // Provider failures map to stable codes the UI localizes; provider
        // payloads never reach the client.
        return void res.status(result.status).json({ error: result.code });
      }
      const payload: TAiEditResponse = { text: result.text };
      return void res.status(200).json(payload);
    } catch {
      return void res.status(502).json({ error: 'ai_edit_unavailable' });
    }
  });

  return router;
}
