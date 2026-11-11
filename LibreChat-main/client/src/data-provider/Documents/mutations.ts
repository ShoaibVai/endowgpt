import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MutationKeys, QueryKeys, dataService } from 'librechat-data-provider';
import type { UseMutationResult, UseMutationOptions } from '@tanstack/react-query';
import type * as t from 'librechat-data-provider';

/** endowGPT document artifacts (React Query wiring). */

export const useSaveDocumentMutation = (
  conversationId: string,
  artifactId: string,
  _options?: UseMutationOptions<t.TDocument, unknown, t.TDocumentUpsert>,
): UseMutationResult<t.TDocument, Error, t.TDocumentUpsert, unknown> => {
  const queryClient = useQueryClient();
  const { onSuccess, onError, onMutate, ...options } = _options ?? {};
  const mutationOptions: UseMutationOptions<
    t.TDocument,
    Error,
    t.TDocumentUpsert
  > = {
    mutationKey: [MutationKeys.documentSave, conversationId, artifactId],
    mutationFn: (variables) =>
      dataService.upsertDocument(conversationId, artifactId, variables),
    onMutate,
    onError,
    onSuccess: (data, variables, context) => {
      queryClient.setQueryData<t.TDocument>(
        [QueryKeys.documents, conversationId, artifactId],
        data,
      );
      onSuccess?.(data, variables, context);
    },
    ...options,
  };

  return useMutation(mutationOptions);
};

export const useRestoreDocumentMutation = (
  conversationId: string,
  artifactId: string,
  _options?: UseMutationOptions<t.TDocument, Error, string>,
): UseMutationResult<t.TDocument, Error, string, unknown> => {
  const queryClient = useQueryClient();
  const { onSuccess, onError, onMutate, ...options } = _options ?? {};
  const mutationOptions: UseMutationOptions<t.TDocument, Error, string> = {
    mutationKey: [MutationKeys.documentRestore, conversationId, artifactId],
    mutationFn: (versionId) =>
      dataService.restoreDocumentVersion(conversationId, artifactId, versionId),
    onMutate,
    onError,
    onSuccess: (data, variables, context) => {
      queryClient.setQueryData<t.TDocument>(
        [QueryKeys.documents, conversationId, artifactId],
        data,
      );
      onSuccess?.(data, variables, context);
    },
    ...options,
  };

  return useMutation(mutationOptions);
};

export const useDeleteDocumentMutation = (
  _options?: UseMutationOptions<void, Error, { conversationId: string; artifactId: string }>,
): UseMutationResult<
  void,
  Error,
  { conversationId: string; artifactId: string },
  unknown
> => {
  const queryClient = useQueryClient();
  const { onSuccess, onError, onMutate, ...options } = _options ?? {};
  const mutationOptions: UseMutationOptions<
    void,
    Error,
    { conversationId: string; artifactId: string }
  > = {
    mutationKey: [MutationKeys.documentDelete],
    mutationFn: ({ conversationId, artifactId }) =>
      dataService.deleteDocument(conversationId, artifactId),
    onMutate,
    onError,
    onSuccess: (data, variables, context) => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.documents] });
      queryClient.removeQueries({
        queryKey: [QueryKeys.documents, variables.conversationId, variables.artifactId],
      });
      onSuccess?.(data, variables, context);
    },
    ...options,
  };

  return useMutation(mutationOptions);
};

export const useAiEditDocumentMutation = (
  _options?: UseMutationOptions<t.TAiEditResponse, Error, t.TAiEditRequest>,
): UseMutationResult<t.TAiEditResponse, Error, t.TAiEditRequest, unknown> => {
  const { onSuccess, onError, onMutate, ...options } = _options ?? {};
  const mutationOptions: UseMutationOptions<
    t.TAiEditResponse,
    Error,
    t.TAiEditRequest
  > = {
    mutationKey: [MutationKeys.documentAiEdit],
    mutationFn: (variables) => dataService.aiEditDocument(variables),
    onMutate,
    onError,
    onSuccess,
    ...options,
  };

  return useMutation(mutationOptions);
};
