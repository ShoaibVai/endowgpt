import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

/** endowGPT superadmin portal (React Query wiring). All reads are gated by the
 *  server's `access:admin` capability; `retry: false` keeps a 403 quiet. */

export const useSuperAdminAccessQuery = (
  userId?: string,
  config?: UseQueryOptions<t.TSuperAdminAccess>,
): QueryObserverResult<t.TSuperAdminAccess, unknown> => {
  return useQuery<t.TSuperAdminAccess>(
    [QueryKeys.superAdminAccess, userId ?? 'anonymous'],
    () => dataService.getSuperAdminAccess(),
    {
      retry: false,
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      ...config,
    },
  );
};

export const useSuperAdminOverviewQuery = (
  params: t.TSuperAdminOverviewParams,
  config?: UseQueryOptions<t.TSuperAdminOverview>,
): QueryObserverResult<t.TSuperAdminOverview, unknown> => {
  return useQuery<t.TSuperAdminOverview>(
    [QueryKeys.superAdminOverview, params],
    () => dataService.getSuperAdminOverview(params),
    {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};

export const useSuperAdminUsersQuery = (
  params: t.TSuperAdminUsersParams,
  config?: UseQueryOptions<t.TSuperAdminUsersResponse>,
): QueryObserverResult<t.TSuperAdminUsersResponse, unknown> => {
  return useQuery<t.TSuperAdminUsersResponse>(
    [QueryKeys.superAdminUsers, params],
    () => dataService.getSuperAdminUsers(params),
    {
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};

export const useSuperAdminConversationsQuery = (
  userId: string | null,
  params: t.TSuperAdminConversationsParams,
  config?: UseQueryOptions<t.TSuperAdminConversationsResponse>,
): QueryObserverResult<t.TSuperAdminConversationsResponse, unknown> => {
  return useQuery<t.TSuperAdminConversationsResponse>(
    [QueryKeys.superAdminConversations, userId, params],
    () => dataService.getSuperAdminConversations(userId ?? '', params),
    {
      enabled: !!userId,
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};

export const useSuperAdminMessagesQuery = (
  userId: string | null,
  conversationId: string | null,
  params: t.TSuperAdminMessagesParams,
  config?: UseQueryOptions<t.TSuperAdminMessagesResponse>,
): QueryObserverResult<t.TSuperAdminMessagesResponse, unknown> => {
  return useQuery<t.TSuperAdminMessagesResponse>(
    [QueryKeys.superAdminMessages, userId, conversationId, params],
    () =>
      dataService.getSuperAdminMessages(conversationId ?? '', {
        ...params,
        userId: userId ?? undefined,
      }),
    {
      enabled: !!userId && !!conversationId,
      keepPreviousData: true,
      refetchOnWindowFocus: false,
      ...config,
    },
  );
};
