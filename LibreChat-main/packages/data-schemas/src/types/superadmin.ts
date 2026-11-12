import type {
  TSuperAdminConversation,
  TSuperAdminDailyPoint,
  TSuperAdminMessage,
  TSuperAdminModelUsage,
  TSuperAdminOverview,
  TSuperAdminUser,
} from 'librechat-data-provider';

/** Storage-facing superadmin contracts. Wire shapes come from
 *  `librechat-data-provider`; only the method inputs live here. */

export type SuperAdminScope = {
  from: Date;
  to: Date;
  /** Undefined means deployment-wide (a true superadmin read). */
  tenantId?: string;
};

export type SuperAdminOverviewResult = TSuperAdminOverview;

export type SuperAdminUsersParams = SuperAdminScope & {
  page: number;
  pageSize: number;
  search?: string;
  sort?: 'createdAt' | 'name';
};

export type SuperAdminUsersResult = {
  users: TSuperAdminUser[];
  total: number;
};

export type SuperAdminConversationsParams = {
  userId: string;
  page: number;
  pageSize: number;
  search?: string;
  tenantId?: string;
};

export type SuperAdminConversationsResult = {
  conversations: TSuperAdminConversation[];
  total: number;
};

export type SuperAdminMessagesParams = {
  conversationId: string;
  userId: string;
  page: number;
  pageSize: number;
  tenantId?: string;
};

export type SuperAdminMessagesResult = {
  messages: TSuperAdminMessage[];
  total: number;
} | null;

export type SuperAdminDailyRow = TSuperAdminDailyPoint;
export type SuperAdminModelRow = TSuperAdminModelUsage;
