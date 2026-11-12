import { useEffect } from 'react';
import { useFilePreviewBlob } from '~/data-provider';

/** Fetches the original bytes once per file for client-side viewers. */
export default function useFileBlob(
  userId: string | undefined,
  fileId: string | undefined,
  shareId?: string,
) {
  const query = useFilePreviewBlob(userId, fileId, shareId);
  const { refetch } = query;

  useEffect(() => {
    if (!fileId || (!shareId && !userId)) {
      return;
    }
    void refetch();
  }, [fileId, refetch, shareId, userId]);

  return query;
}
