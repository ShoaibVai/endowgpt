import { z } from 'zod';
import * as endpoints from './api-endpoints';
import request from './request';

/** endowGPT superadmin portal: deployment-wide token usage and read-only chat
 *  history. The wire shapes are shared with the client; storage-specific query
 *  types live in `packages/data-schemas` so Mongoose stays out of this surface. */

/* --------------------------------------------------------------- constants */

export const SUPER_ADMIN_RANGES = ['24h', '7d', '30d', 'all'] as const;
export type TSuperAdminRange = (typeof SUPER_ADMIN_RANGES)[number];

export const SUPER_ADMIN_DEFAULT_RANGE: TSuperAdminRange = '30d';
export const SUPER_ADMIN_DEFAULT_PAGE_SIZE = 25;
export const SUPER_ADMIN_MAX_PAGE_SIZE = 100;
/** Deep `skip` values are a cheap way to make the database work hard; the
 *  portal never needs to page further than this. */
export const SUPER_ADMIN_MAX_PAGE = 1000;
export const SUPER_ADMIN_SEARCH_MAX_LENGTH = 120;
/** The viewer is a read-only inspector, not an export tool: cap one message. */
export const SUPER_ADMIN_MESSAGE_MAX_CHARS = 20000;

export const superAdminRangeSchema = z.enum(SUPER_ADMIN_RANGES).default(SUPER_ADMIN_DEFAULT_RANGE);

export const superAdminQuerySchema = z.object({
  range: superAdminRangeSchema,
  page: z.coerce.number().int().min(1).max(SUPER_ADMIN_MAX_PAGE).optional(),
  pageSize: z.coerce.number().int().min(1).max(SUPER_ADMIN_MAX_PAGE_SIZE).optional(),
  search: z.string().trim().max(SUPER_ADMIN_SEARCH_MAX_LENGTH).optional(),
  sort: z.enum(['createdAt', 'name']).optional(),
});

export type TSuperAdminQuery = z.infer<typeof superAdminQuerySchema>;

/* ------------------------------------------------------------------- types */

export const superAdminAccessSchema = z.object({
  access: z.boolean(),
});

export type TSuperAdminAccess = z.infer<typeof superAdminAccessSchema>;

export const superAdminUsageSchema = z.object({
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
});

export type TSuperAdminUsage = z.infer<typeof superAdminUsageSchema>;

export const superAdminModelUsageSchema = superAdminUsageSchema.extend({
  model: z.string(),
  messages: z.number(),
});

export type TSuperAdminModelUsage = z.infer<typeof superAdminModelUsageSchema>;

export const superAdminDailyPointSchema = z.object({
  date: z.string(),
  conversations: z.number(),
  messages: z.number(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
});

export type TSuperAdminDailyPoint = z.infer<typeof superAdminDailyPointSchema>;

export const superAdminOverviewSchema = z.object({
  totals: superAdminUsageSchema.extend({
    users: z.number(),
    activeUsers: z.number(),
    conversations: z.number(),
    messages: z.number(),
    /** Which collection supplied the token numbers for this range. */
    tokenSource: z.enum(['transactions', 'messages']),
  }),
  daily: z.array(superAdminDailyPointSchema),
  models: z.array(superAdminModelUsageSchema),
});

export type TSuperAdminOverview = z.infer<typeof superAdminOverviewSchema>;

export const superAdminUserSchema = z.object({
  userId: z.string(),
  name: z.string(),
  username: z.string(),
  email: z.string(),
  role: z.string(),
  createdAt: z.string(),
  lastActiveAt: z.string().nullable(),
  conversations: z.number(),
  messages: z.number(),
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
});

export type TSuperAdminUser = z.infer<typeof superAdminUserSchema>;

export const superAdminUsersResponseSchema = z.object({
  users: z.array(superAdminUserSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  pages: z.number(),
});

export type TSuperAdminUsersResponse = z.infer<typeof superAdminUsersResponseSchema>;

export const superAdminConversationSchema = z.object({
  conversationId: z.string(),
  title: z.string(),
  model: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  messages: z.number(),
  totalTokens: z.number(),
  archived: z.boolean(),
});

export type TSuperAdminConversation = z.infer<typeof superAdminConversationSchema>;

export const superAdminConversationsResponseSchema = z.object({
  conversations: z.array(superAdminConversationSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  pages: z.number(),
});

export type TSuperAdminConversationsResponse = z.infer<
  typeof superAdminConversationsResponseSchema
>;

export const superAdminMessageSchema = z.object({
  messageId: z.string(),
  isCreatedByUser: z.boolean(),
  sender: z.string(),
  model: z.string(),
  text: z.string(),
  /** True when `text` was clipped for display. */
  truncated: z.boolean(),
  tokenCount: z.number(),
  createdAt: z.string(),
});

export type TSuperAdminMessage = z.infer<typeof superAdminMessageSchema>;

export const superAdminMessagesResponseSchema = z.object({
  conversationId: z.string(),
  messages: z.array(superAdminMessageSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  pages: z.number(),
});

export type TSuperAdminMessagesResponse = z.infer<typeof superAdminMessagesResponseSchema>;

export const superAdminDocumentSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  userEmail: z.string(),
  conversationId: z.string(),
  artifactId: z.string(),
  title: z.string(),
  versionCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type TSuperAdminDocument = z.infer<typeof superAdminDocumentSchema>;

export const superAdminDocumentsResponseSchema = z.object({
  documents: z.array(superAdminDocumentSchema),
  page: z.number(),
  pageSize: z.number(),
  total: z.number(),
  pages: z.number(),
});

export type TSuperAdminDocumentsResponse = z.infer<typeof superAdminDocumentsResponseSchema>;

export const superAdminDocumentDetailSchema = superAdminDocumentSchema.extend({
  content: z.string(),
  versions: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      createdAt: z.number(),
      source: z.string(),
    }),
  ),
});

export type TSuperAdminDocumentDetail = z.infer<typeof superAdminDocumentDetailSchema>;

export const superAdminAuditEntrySchema = z.object({
  id: z.string(),
  category: z.string(),
  action: z.string(),
  outcome: z.string(),
  severity: z.string(),
  actor: z.object({
    type: z.string(),
    id: z.string().optional(),
    name: z.string(),
  }),
  target: z.object({
    type: z.string(),
    id: z.string().optional(),
    name: z.string().optional(),
  }),
  metadata: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.string(),
});

export type TSuperAdminAuditEntry = z.infer<typeof superAdminAuditEntrySchema>;

export const superAdminAuditResponseSchema = z.object({
  entries: z.array(superAdminAuditEntrySchema),
  total: z.number(),
  nextCursor: z.number().nullable(),
});

export type TSuperAdminAuditResponse = z.infer<typeof superAdminAuditResponseSchema>;

export type TSuperAdminOverviewParams = {
  range?: TSuperAdminRange;
};

export type TSuperAdminUsersParams = TSuperAdminOverviewParams & {
  page?: number;
  pageSize?: number;
  search?: string;
  sort?: 'createdAt' | 'name';
};

export type TSuperAdminConversationsParams = {
  page?: number;
  pageSize?: number;
  search?: string;
};

export type TSuperAdminMessagesParams = {
  page?: number;
  pageSize?: number;
  /** The conversation owner; the server verifies the pairing. */
  userId?: string;
};

export type TSuperAdminDocumentsParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  userId?: string;
};

export type TSuperAdminAuditParams = {
  page?: number;
  pageSize?: number;
  search?: string;
};

/* ---------------------------------------------------------------- service */

function querySuffix(params: Record<string, unknown>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') {
      query.set(key, String(value));
    }
  }
  const suffix = query.toString();
  return suffix ? `?${suffix}` : '';
}

export function getSuperAdminAccess(): Promise<TSuperAdminAccess> {
  return request.get(endpoints.superAdminAccess());
}

export function getSuperAdminOverview(
  params: TSuperAdminOverviewParams = {},
): Promise<TSuperAdminOverview> {
  return request.get(`${endpoints.superAdminOverview()}${querySuffix(params)}`);
}

export function getSuperAdminUsers(
  params: TSuperAdminUsersParams = {},
): Promise<TSuperAdminUsersResponse> {
  return request.get(`${endpoints.superAdminUsers()}${querySuffix(params)}`);
}

export function getSuperAdminConversations(
  userId: string,
  params: TSuperAdminConversationsParams = {},
): Promise<TSuperAdminConversationsResponse> {
  return request.get(`${endpoints.superAdminUserConversations(userId)}${querySuffix(params)}`);
}

export function getSuperAdminMessages(
  conversationId: string,
  params: TSuperAdminMessagesParams = {},
): Promise<TSuperAdminMessagesResponse> {
  const { userId, ...query } = params;
  const suffix = querySuffix(query);
  const owner = userId ? `${suffix ? '&' : '?'}userId=${encodeURIComponent(userId)}` : '';
  return request.get(
    `${endpoints.superAdminConversationMessages(conversationId)}${suffix}${owner}`,
  );
}

export function getSuperAdminDocuments(
  params: TSuperAdminDocumentsParams = {},
): Promise<TSuperAdminDocumentsResponse> {
  return request.get(`${endpoints.superAdminDocuments()}${querySuffix(params)}`);
}

export function getSuperAdminDocument(
  userId: string,
  conversationId: string,
  artifactId: string,
): Promise<TSuperAdminDocumentDetail> {
  return request.get(endpoints.superAdminDocument(userId, conversationId, artifactId));
}

export function getSuperAdminAudit(
  params: TSuperAdminAuditParams = {},
): Promise<TSuperAdminAuditResponse> {
  const { page = 1, pageSize = 25, ...rest } = params;
  return request.get(
    `${endpoints.superAdminAudit()}${querySuffix({
      ...rest,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    })}`,
  );
}
