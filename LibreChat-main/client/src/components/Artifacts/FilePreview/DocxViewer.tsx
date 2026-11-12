import { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';
import { PreviewError, PreviewSkeleton } from './States';
import useFileBlob from './useFileBlob';

type DocxViewerProps = {
  userId?: string;
  fileId?: string;
  shareId?: string;
};

export default function DocxViewer({ userId, fileId, shareId }: DocxViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState(false);
  const [renderToken, setRenderToken] = useState(0);
  const { data: blob, isLoading, isError, refetch } = useFileBlob(userId, fileId, shareId);

  useEffect(() => {
    const container = containerRef.current;
    if (blob == null || container == null) {
      return;
    }
    let cancelled = false;
    container.innerHTML = '';
    setRendering(true);
    setRenderError(false);

    void renderAsync(blob, container, undefined, {
      inWrapper: true,
      breakPages: true,
      className: 'docx-preview',
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      useBase64URL: true,
    })
      .catch(() => {
        if (!cancelled) {
          setRenderError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setRendering(false);
        }
      });

    return () => {
      cancelled = true;
      container.innerHTML = '';
    };
  }, [blob, renderToken]);

  const retry = () => {
    setRenderError(false);
    setRenderToken((token) => token + 1);
    if (isError) {
      void refetch();
    }
  };

  return (
    <div className="bg-surface-tertiary relative h-full min-h-0">
      <div ref={containerRef} className="h-full overflow-auto p-4" data-testid="docx-preview" />
      {(isLoading || rendering) && !isError && !renderError && (
        <div className="bg-surface-primary absolute inset-0">
          <PreviewSkeleton rows={8} />
        </div>
      )}
      {(isError || renderError) && (
        <div className="bg-surface-primary absolute inset-0">
          <PreviewError onRetry={retry} />
        </div>
      )}
    </div>
  );
}
