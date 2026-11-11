import { z } from 'zod';
import { documentsConfigSchema } from './config';
import * as endpoints from './api-endpoints';
import request from './request';

/** endowGPT document artifacts: request/response shapes resolved here (shared
 *  API surface, no Mongoose types per repo rules), plus the REST service.
 *  React Query wiring lives in the client's `~/data-provider`; keys are
 *  `QueryKeys.document*` / `MutationKeys.document*`. */

/* ---------------------------------------------------------------- schemas */

export const documentVersionSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
  /** What produced this version: model | user | ai_edit | restore | import. */
  source: z.string(),
});

export type TDocumentVersionMeta = z.infer<typeof documentVersionSchema>;

export const documentSummarySchema = z.object({
  artifactId: z.string(),
  conversationId: z.string(),
  title: z.string(),
  updatedAt: z.number(),
  versionCount: z.number(),
});

export type TDocumentSummary = z.infer<typeof documentSummarySchema>;

export const documentUpsertSchema = z.object({
  title: z.string().min(1).max(300),
  content: z.string(),
  /** Newest version the client last saw; a stale id yields a conflict. */
  baseVersionId: z.string().optional(),
  /** One of: model | user | ai_edit | restore | import. Defaults to user. */
  versionSource: z.string().optional(),
});

export type TDocumentUpsert = z.infer<typeof documentUpsertSchema>;

export const documentSchema = z.object({
  artifactId: z.string(),
  conversationId: z.string(),
  title: z.string(),
  content: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  versionId: z.string(),
  versions: z.array(documentVersionSchema),
  /** Set with HTTP 409: another session advanced the document first. */
  conflict: z.boolean().optional(),
});

export type TDocument = z.infer<typeof documentSchema>;

export const documentVersionContentSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
  content: z.string(),
});

export type TDocumentVersionContent = z.infer<typeof documentVersionContentSchema>;

export const aiEditRequestSchema = z.object({
  /** The exact selected text the replacement stands in for. */
  text: z.string().min(1),
  /** Instruction for the replacement; mode refines the system prompt. */
  instruction: z.string().min(1).max(2000),
  /** One of the allow-listed model ids; anything else is rejected server-side. */
  model: z.string(),
  mode: z
    .enum(['improve', 'shorten', 'expand', 'fix_grammar', 'translate', 'tone', 'custom'])
    .default('custom'),
  language: z.string().optional(),
  tone: z.string().optional(),
});

export type TAiEditRequest = z.infer<typeof aiEditRequestSchema>;

export const aiEditResponseSchema = z.object({
  text: z.string(),
});

export type TAiEditResponse = z.infer<typeof aiEditResponseSchema>;

/** Resolved `documents` limits, same shape `startupConfig.documents` reports. */
export type TDocumentLimits = z.infer<typeof documentsConfigSchema>;

/* ---------------------------------------------------------------- service */

export function getDocuments(): Promise<TDocumentSummary[]> {
  return request.get(endpoints.documents());
}

export function getDocument(
  conversationId: string,
  artifactId: string,
): Promise<TDocument> {
  return request.get(endpoints.documentPath(conversationId, artifactId));
}

export function upsertDocument(
  conversationId: string,
  artifactId: string,
  payload: TDocumentUpsert,
): Promise<TDocument> {
  return request.put(endpoints.documentPath(conversationId, artifactId), payload);
}

export function deleteDocument(
  conversationId: string,
  artifactId: string,
): Promise<void> {
  return request.delete(endpoints.documentPath(conversationId, artifactId));
}

export function getDocumentVersion(
  conversationId: string,
  artifactId: string,
  versionId: string,
): Promise<TDocumentVersionContent> {
  return request.get(
    endpoints.documentVersionPath(conversationId, artifactId, versionId),
  );
}

export function restoreDocumentVersion(
  conversationId: string,
  artifactId: string,
  versionId: string,
): Promise<TDocument> {
  return request.post(endpoints.documentRestorePath(conversationId, artifactId), {
    versionId,
  });
}

export function aiEditDocument(payload: TAiEditRequest): Promise<TAiEditResponse> {
  return request.post(endpoints.documentAiEditPath(), payload);
}
