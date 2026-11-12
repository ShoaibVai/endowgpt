import { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { lazyWithRecovery } from '~/lib/assets/lazy';
import { PreviewError, PreviewSkeleton, PreviewUnavailable } from './States';

const PdfViewer = lazyWithRecovery(() => import('./PdfViewer'));

type PptxViewerProps = {
  fileId?: string;
  shareId?: string;
};

export default function PptxViewer({ fileId, shareId }: PptxViewerProps) {
  const { data: startupConfig } = useGetStartupConfig();
  const enabled = startupConfig?.filePreview?.pptxEnabled === true && !shareId;
  const query = useQuery(
    [QueryKeys.fileDownload, 'pdfPreview', fileId, shareId ?? 'owner'],
    async () => {
      const response = await dataService.getFilePdfPreview(fileId ?? '');
      return response.data as Blob;
    },
    {
      enabled: enabled && Boolean(fileId),
      retry: false,
      staleTime: 5 * 60 * 1000,
    },
  );

  if (!enabled) {
    return <PreviewUnavailable />;
  }
  if (query.isLoading) {
    return <PreviewSkeleton rows={8} />;
  }
  if (query.isError || query.data == null) {
    return <PreviewError onRetry={() => void query.refetch()} />;
  }
  return (
    <Suspense fallback={<PreviewSkeleton rows={8} />}>
      <PdfViewer file={query.data} />
    </Suspense>
  );
}
