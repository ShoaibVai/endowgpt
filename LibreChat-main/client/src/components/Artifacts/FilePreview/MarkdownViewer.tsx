import { useEffect, useState } from 'react';
import MarkdownLite from '~/components/Chat/Messages/Content/MarkdownLite';
import { PreviewError, PreviewSkeleton } from './States';
import useFileBlob from './useFileBlob';

type MarkdownViewerProps = {
  userId?: string;
  fileId?: string;
  shareId?: string;
};

export default function MarkdownViewer({ userId, fileId, shareId }: MarkdownViewerProps) {
  const [content, setContent] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [readError, setReadError] = useState(false);
  const [readToken, setReadToken] = useState(0);
  const { data: blob, isLoading, isError, refetch } = useFileBlob(userId, fileId, shareId);

  useEffect(() => {
    if (blob == null) {
      return;
    }
    let cancelled = false;
    setReadError(false);
    setLoaded(false);
    void blob
      .text()
      .then((text) => {
        if (!cancelled) {
          setContent(text);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setReadError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [blob, readToken]);

  const retry = () => {
    setReadError(false);
    setReadToken((token) => token + 1);
    if (isError) {
      void refetch();
    }
  };

  if (isError || readError) {
    return <PreviewError onRetry={retry} />;
  }
  if (isLoading || blob == null || !loaded) {
    return <PreviewSkeleton rows={8} />;
  }

  return (
    <div className="preview-scroll h-full overflow-auto p-4" data-testid="markdown-preview">
      <MarkdownLite content={content} codeExecution={false} />
    </div>
  );
}
