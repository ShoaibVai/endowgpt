import React, { memo, useCallback, useEffect, useId, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Button, Spinner } from '@librechat/client';
import type { ProcessedMermaidSvg } from '~/utils/diagram/export';
import useSvgProcessing from './useSvgProcessing';
import useMermaidZoom from './useMermaidZoom';
import MermaidDialog from './MermaidDialog';
import MermaidHeader from './MermaidHeader';
import ZoomControls from './ZoomControls';
import { useLocalize } from '~/hooks';
import cn from '~/utils/cn';

interface MermaidProps {
  children: string;
  id?: string;
  theme?: string;
}

interface MermaidRendererProps extends MermaidProps {
  fillContainer?: boolean;
  onExpand?: () => void;
  onExportReady?: (data: ProcessedMermaidSvg | null) => void;
  exportFilename: string;
  showExpandButton?: boolean;
  showHeader?: boolean;
}

const Mermaid: React.FC<MermaidProps> = memo(({ children, id, theme }) => {
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const defaultTitle = useLocalize()('com_ui_mermaid_diagram');
  const rendererId = id || instanceId;

  return (
    <MermaidRenderer id={rendererId} theme={theme} exportFilename={defaultTitle}>
      {children}
    </MermaidRenderer>
  );
});

export const MermaidRenderer = memo(function MermaidRenderer({
  children,
  id,
  theme,
  onExpand,
  onExportReady,
  exportFilename,
  fillContainer = false,
  showExpandButton = true,
  showHeader = true,
}: MermaidRendererProps) {
  const localize = useLocalize();
  const [showCode, setShowCode] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [showMobileControls, setShowMobileControls] = useState(false);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const streamingCodeRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
  }, []);

  const {
    blobUrl,
    processedSvg,
    svgDimensions,
    isLoading,
    error,
    lastValidSvgRef,
    initialScale,
    calculatedHeight,
  } = useSvgProcessing({ content: children, id, theme, retryCount, containerRef });

  const exportReadyRef = useRef(onExportReady);

  useEffect(() => {
    exportReadyRef.current = onExportReady;
    onExportReady?.(processedSvg == null ? null : { svg: processedSvg, dimensions: svgDimensions });
  }, [onExportReady, processedSvg, svgDimensions]);

  /* The preview tab unmounts when the panel switches to the code view, which
   * would otherwise leave the toolbar exporting a payload no longer on screen
   * and no longer matching an edited source. */
  useEffect(() => () => exportReadyRef.current?.(null), []);

  const { zoom, pan, isPanning, handleZoomIn, handleZoomOut, handleResetZoom, handleMouseDown } =
    useMermaidZoom({ containerRef, wheelDep: blobUrl });

  useEffect(() => {
    if (isLoading && streamingCodeRef.current) {
      streamingCodeRef.current.scrollTop = streamingCodeRef.current.scrollHeight;
    }
  }, [children, isLoading]);

  const handleToggleCode = useCallback(() => setShowCode((prev) => !prev), []);
  const handleRetry = useCallback(() => setRetryCount((prev) => prev + 1), []);
  const handleExpand = useCallback(() => {
    if (onExpand != null) {
      onExpand();
      return;
    }
    setIsDialogOpen(true);
  }, [onExpand]);

  const handleContainerClick = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!isTouchDevice) {
        return;
      }
      const target = e.target as HTMLElement;
      if (!target.closest('button, a, [role="button"]')) {
        setShowMobileControls((prev) => !prev);
      }
    },
    [isTouchDevice],
  );

  const showControls = isTouchDevice
    ? showMobileControls || showCode
    : isHovered || isFocusWithin || showCode;

  const hoverHandlers = {
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
    onFocus: () => setIsFocusWithin(true),
    onBlur: (e: React.FocusEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
        setIsFocusWithin(false);
      }
    },
  };

  const diagramStyle = {
    width: svgDimensions ? `${svgDimensions.width * initialScale}px` : 'auto',
    height: svgDimensions ? `${svgDimensions.height * initialScale}px` : 'auto',
  };

  if (isLoading) {
    if (lastValidSvgRef.current && blobUrl) {
      return (
        <>
          {showExpandButton && onExpand == null && (
            <MermaidDialog
              open={isDialogOpen}
              onOpenChange={setIsDialogOpen}
              triggerRef={expandButtonRef}
              blobUrl={blobUrl}
              codeContent={children}
              exportSvg={processedSvg}
              exportDimensions={svgDimensions}
              exportFilename={exportFilename}
            />
          )}
          <div
            className={cn(
              'relative w-full overflow-hidden rounded-lg border transition-all duration-200',
              fillContainer && 'h-full rounded-xl',
              showControls ? 'border-border-light' : 'border-transparent',
            )}
            {...hoverHandlers}
            onClick={handleContainerClick}
          >
            {showHeader && (
              <MermaidHeader
                className={cn(
                  showCode
                    ? 'border-border-light bg-surface-secondary relative z-20 border-b'
                    : 'absolute top-0 right-0 left-0 z-20',
                  showControls ? 'opacity-100' : 'pointer-events-none opacity-0',
                )}
                codeContent={children}
                showCode={showCode}
                showExpandButton={showExpandButton}
                expandButtonRef={expandButtonRef}
                expandLabel={undefined}
                exportSvg={processedSvg}
                exportDimensions={svgDimensions}
                exportFilename={exportFilename}
                onExpand={handleExpand}
                onToggleCode={handleToggleCode}
              />
            )}
            {showCode && (
              <div className="bg-surface-primary-alt min-h-[9.375rem] p-4">
                <pre className="text-text-secondary overflow-auto font-mono text-xs whitespace-pre-wrap">
                  {children}
                </pre>
              </div>
            )}
            <div
              ref={containerRef}
              hidden={showCode}
              className={cn(
                'relative overflow-hidden rounded-md p-4 transition-colors duration-200',
                fillContainer && 'h-full rounded-lg',
                'bg-surface-primary-alt',
                isPanning ? 'cursor-grabbing' : 'cursor-grab',
              )}
              style={fillContainer ? undefined : { height: `${calculatedHeight}px` }}
              data-testid={fillContainer ? 'mermaid-artifact-canvas' : undefined}
              onMouseDown={handleMouseDown}
            >
              <div className="border-border-light bg-surface-secondary text-text-secondary absolute inset-s-2 top-2 z-10 flex items-center gap-1 rounded border px-2 py-1 text-xs">
                <Spinner className="h-3 w-3" />
              </div>
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transition: isPanning ? 'none' : 'transform 0.1s ease-out',
                }}
              >
                <img
                  src={blobUrl}
                  alt={localize('com_ui_mermaid_diagram')}
                  className="opacity-70 select-none"
                  style={diagramStyle}
                  draggable={false}
                />
              </div>
              <ZoomControls
                zoom={zoom}
                pan={pan}
                codeContent={children}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onReset={handleResetZoom}
                className={cn(
                  'absolute inset-e-2 bottom-2 z-10 transition-opacity duration-200',
                  showControls ? 'opacity-100' : 'pointer-events-none opacity-0',
                )}
              />
            </div>
          </div>
        </>
      );
    }

    if (!showHeader) {
      return (
        <div
          className={cn(
            'border-border-light bg-surface-primary-alt text-text-secondary flex min-h-[12.5rem] w-full items-center justify-center rounded-lg border',
            fillContainer && 'h-full rounded-xl',
          )}
          role="status"
        >
          <Spinner className="size-5" aria-hidden="true" />
          <span className="sr-only">{localize('com_ui_loading')}</span>
        </div>
      );
    }

    return (
      <div
        className={cn(
          'border-border-light w-full overflow-hidden rounded-lg border',
          fillContainer && 'h-full rounded-xl',
        )}
      >
        <div className="border-border-light bg-surface-secondary text-text-secondary flex items-center gap-2 border-b px-4 py-2 font-sans text-xs">
          <Spinner className="h-3 w-3" />
          <span className="font-medium">{localize('com_ui_mermaid')}</span>
        </div>
        <pre
          ref={streamingCodeRef}
          className="bg-surface-primary-alt text-text-secondary max-h-[21.875rem] min-h-[9.375rem] overflow-auto p-4 font-mono text-xs whitespace-pre-wrap"
        >
          {children}
        </pre>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-border-light w-full overflow-hidden rounded-lg border">
        {showHeader && (
          <MermaidHeader
            codeContent={children}
            showCode={showCode}
            onToggleCode={handleToggleCode}
          />
        )}
        {showCode ? (
          <div className="border-border-light bg-surface-primary-alt border-t p-4">
            <pre className="text-text-secondary overflow-auto text-xs whitespace-pre-wrap">
              {children}
            </pre>
          </div>
        ) : (
          <div className="border-border-light bg-surface-tertiary border-t p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-text-destructive font-semibold">
                {localize('com_ui_mermaid_failed')}
              </span>
              <Button
                variant="quiet"
                size="sm"
                onClick={handleRetry}
                className="h-auto gap-1 rounded px-2 py-1 text-xs"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                {localize('com_ui_retry')}
              </Button>
            </div>
            <pre className="text-text-destructive overflow-auto text-xs">{error.message}</pre>
          </div>
        )}
      </div>
    );
  }

  if (!blobUrl) {
    return null;
  }

  return (
    <>
      {showExpandButton && onExpand == null && (
        <MermaidDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          triggerRef={expandButtonRef}
          blobUrl={blobUrl}
          codeContent={children}
          exportSvg={processedSvg}
          exportDimensions={svgDimensions}
          exportFilename={exportFilename}
        />
      )}
      <div
        className={cn(
          'border-border-light relative w-full overflow-hidden rounded-lg border transition-all duration-200',
          fillContainer && 'h-full rounded-xl',
        )}
        {...hoverHandlers}
        onClick={handleContainerClick}
      >
        {showHeader && (
          <MermaidHeader
            className="border-border-light bg-surface-secondary border-b"
            actionsClassName="transition-opacity duration-200"
            codeContent={children}
            showCode={showCode}
            showExpandButton={showExpandButton}
            expandButtonRef={expandButtonRef}
            expandLabel={undefined}
            exportSvg={processedSvg}
            exportDimensions={svgDimensions}
            exportFilename={exportFilename}
            onExpand={handleExpand}
            onToggleCode={handleToggleCode}
          />
        )}
        {showCode && (
          <div className="bg-surface-primary-alt p-4">
            <pre className="text-text-secondary overflow-auto text-xs whitespace-pre-wrap">
              {children}
            </pre>
          </div>
        )}
        <div
          ref={containerRef}
          hidden={showCode}
          className={cn(
            'relative overflow-hidden p-4 transition-colors duration-200',
            fillContainer && 'h-full rounded-lg',
            'bg-surface-primary-alt',
            isPanning ? 'cursor-grabbing' : 'cursor-grab',
          )}
          style={fillContainer ? undefined : { height: `${calculatedHeight}px` }}
          data-testid={fillContainer ? 'mermaid-artifact-canvas' : undefined}
          onMouseDown={handleMouseDown}
        >
          <div
            className="absolute inset-0 flex items-center justify-center"
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transition: isPanning ? 'none' : 'transform 0.1s ease-out',
            }}
          >
            <img
              src={blobUrl}
              alt={localize('com_ui_mermaid_diagram')}
              className="select-none"
              style={diagramStyle}
              draggable={false}
            />
          </div>
          <ZoomControls
            zoom={zoom}
            pan={pan}
            codeContent={children}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onReset={handleResetZoom}
            className={cn(
              'absolute inset-e-2 bottom-2 z-10 transition-opacity duration-200',
              showControls ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
          />
        </div>
      </div>
    </>
  );
});

Mermaid.displayName = 'Mermaid';
MermaidRenderer.displayName = 'MermaidRenderer';

export default Mermaid;
