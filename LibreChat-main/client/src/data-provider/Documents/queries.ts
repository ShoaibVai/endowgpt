import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import type { UseQueryOptions, QueryObserverResult } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

/** endowGPT document artifacts (React Query wiring). */

export const useGetDocumentsQuery = (
  config?: UseQueryOptions<t.TDocumentSummary[]>,
): QueryObserverResult<t.TDocumentSummary[], unknown> => {
  return useQuery<t.TDocumentSummary[]>(
    [QueryKeys.documents],
    () => dataService.getDocuments(),
    {
      staleTime: 15_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      ...config,
    },
  );
};

export const useGetDocumentQuery = (
  conversationId: string,
  artifactId: string,
  config?: UseQueryOptions<t.TDocument>,
): QueryObserverResult<t.TDocument, unknown> => {
  return useQuery<t.TDocument>(
    [QueryKeys.documents, conversationId, artifactId],
    () => dataService.getDocument(conversationId, artifactId),
    config,
  );
};

export const useGetDocumentVersionQuery = (
  conversationId: string,
  artifactId: string,
  versionId: string,
  config?: UseQueryOptions<t.TDocumentVersionContent>,
): QueryObserverResult<t.TDocumentVersionContent, unknown> => {
  return useQuery<t.TDocumentVersionContent>(
    [QueryKeys.documentVersionContent, conversationId, artifactId, versionId],
    () => dataService.getDocumentVersion(conversationId, artifactId, versionId),
    config,
  );
};
