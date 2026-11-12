import { useEffect, useRef, useState } from 'react';
import { Button } from '@librechat/client';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { useLocalize } from '~/hooks';
import { PreviewError, PreviewSkeleton } from './States';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export default function PdfViewer({ file }: { file: Blob }) {
  const localize = useLocalize();
  const containerRef = useRef<HTMLDivElement>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [renderKey, setRenderKey] = useState(0);
  const [loadError, setLoadError] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (container == null) {
      return;
    }
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width > 0) {
        setContainerWidth(width);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const pageWidth = Math.round(Math.max(320, Math.min(1100, containerWidth - 32 || 768)) * zoom);

  const retry = () => {
    setLoadError(false);
    setRenderKey((key) => key + 1);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-border-light bg-surface-primary flex shrink-0 items-center justify-between gap-2 border-b px-3 py-1.5">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={localize('com_ui_file_preview_previous_page')}
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((page) => Math.max(1, page - 1))}
          >
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <span className="text-text-secondary min-w-20 text-center text-xs">
            {localize('com_ui_file_preview_page', {
              0: pageNumber,
              1: numPages || '—',
            })}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={localize('com_ui_file_preview_next_page')}
            disabled={numPages === 0 || pageNumber >= numPages}
            onClick={() => setPageNumber((page) => Math.min(numPages, page + 1))}
          >
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={localize('com_ui_zoom_out')}
            disabled={zoom <= 0.6}
            onClick={() => setZoom((value) => Math.max(0.6, value - 0.2))}
          >
            <ZoomOut className="size-4" aria-hidden="true" />
          </Button>
          <span className="text-text-tertiary w-10 text-center text-xs">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={localize('com_ui_zoom_in')}
            disabled={zoom >= 2}
            onClick={() => setZoom((value) => Math.min(2, value + 0.2))}
          >
            <ZoomIn className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div
        ref={containerRef}
        className="preview-scroll bg-surface-tertiary min-h-0 flex-1 overflow-auto p-4"
      >
        <Document
          key={renderKey}
          file={file}
          loading={<PreviewSkeleton rows={8} />}
          error={<PreviewError onRetry={retry} />}
          onLoadSuccess={({ numPages: total }) => {
            setNumPages(total);
            setPageNumber(1);
            setLoadError(false);
          }}
          onLoadError={() => setLoadError(true)}
          className="flex flex-col items-center gap-4"
        >
          {loadError ? (
            <PreviewError onRetry={retry} />
          ) : (
            <Page
              pageNumber={pageNumber}
              width={pageWidth}
              className="shadow-lg"
              loading={<PreviewSkeleton rows={6} />}
            />
          )}
        </Document>
      </div>
    </div>
  );
}
