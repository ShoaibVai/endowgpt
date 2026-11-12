import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Loader2 } from 'lucide-react';
import type {
  TSpreadsheetPreviewCellStyle,
  TSpreadsheetPreviewSheet,
} from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { PreviewError, PreviewSkeleton } from './States';
import useSpreadsheetPreview from './useSpreadsheetPreview';
import styles from './SpreadsheetViewer.module.css';

const {
  'spreadsheet-width': widthClass,
  'spreadsheet-grid': gridClass,
  'spreadsheet-canvas': canvasClass,
  'spreadsheet-row': rowClass,
  'spreadsheet-cell': cellClass,
} = styles;

type CssVariables = React.CSSProperties & {
  [key: `--${string}`]: string | number | undefined;
};

const ROW_NUMBER_WIDTH = 48;
const HEADER_HEIGHT = 56;
const ROW_HEIGHT = 32;

function columnLetter(columnNumber: number): string {
  let value = columnNumber;
  let result = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    value = Math.floor((value - 1) / 26);
  }
  return result;
}

function columnWidth(width: number | undefined): number {
  return Math.min(320, Math.max(80, Math.round((width ?? 16) * 7.5 + 16)));
}

function decimalPlaces(format: string): number {
  const match = /\.([0#]+)/.exec(format);
  return match?.[1]?.length ?? 0;
}

function formatNumber(value: number, format: string | undefined): string {
  if (format == null) {
    return String(value);
  }
  if (/%/.test(format)) {
    return `${(value * 100).toFixed(decimalPlaces(format))}%`;
  }
  if (/\$/.test(format)) {
    return `$${value.toLocaleString(undefined, {
      minimumFractionDigits: decimalPlaces(format),
      maximumFractionDigits: decimalPlaces(format),
    })}`;
  }
  if (/[#0],/.test(format)) {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: decimalPlaces(format),
      maximumFractionDigits: decimalPlaces(format),
    });
  }
  if (/0\.0+/.test(format)) {
    return value.toFixed(decimalPlaces(format));
  }
  return String(value);
}

function formatCell(value: unknown, style: TSpreadsheetPreviewCellStyle | undefined): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  if (typeof value === 'number') {
    return formatNumber(value, style?.numFmt);
  }
  if (typeof value === 'string') {
    if (style?.numFmt != null && /[ymd]/i.test(style.numFmt)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString();
      }
    }
    return value;
  }
  return String(value);
}

function cellStyle(style: TSpreadsheetPreviewCellStyle | undefined): CssVariables {
  const fontColor = style?.fontColor ?? (style?.fill != null ? '#0F172A' : undefined);
  return {
    '--cell-fill': style?.fill,
    '--cell-ink': fontColor,
    '--cell-weight': style?.bold === true ? '600' : undefined,
    '--cell-style': style?.italic === true ? 'italic' : undefined,
    '--cell-align': style?.align,
  };
}

export default function SpreadsheetViewer({ fileId }: { fileId?: string }) {
  const localize = useLocalize();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const {
    data,
    error,
    isError,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useSpreadsheetPreview(fileId, sheetIndex, Boolean(fileId));

  const firstPage = data?.pages[0];
  const sheetMetas = firstPage?.sheets ?? [];
  const currentSheet: TSpreadsheetPreviewSheet | undefined = sheetMetas.find(
    (sheet) => sheet.index === sheetIndex,
  );
  const sheetError = firstPage?.sheetError;

  const rows = useMemo(
    () =>
      data?.pages.flatMap(
        (page) => page.sheets?.find((sheet) => sheet.index === sheetIndex)?.rows ?? [],
      ) ?? [],
    [data, sheetIndex],
  );
  const styles = useMemo(() => {
    const result: Record<string, TSpreadsheetPreviewCellStyle> = {};
    for (const page of data?.pages ?? []) {
      const sheet = page.sheets?.find((entry) => entry.index === sheetIndex);
      if (sheet?.styles != null) {
        Object.assign(result, sheet.styles);
      }
    }
    return result;
  }, [data, sheetIndex]);

  const columns = currentSheet?.columns ?? [];
  const widths = columns.map((column) => columnWidth(column.width));
  const totalWidth = ROW_NUMBER_WIDTH + widths.reduce((sum, width) => sum + width, 0);
  const gridTemplateColumns = `${ROW_NUMBER_WIDTH}px ${widths.map((width) => `${width}px`).join(' ')}`;
  const gridVariables: CssVariables = {
    '--spreadsheet-grid': gridTemplateColumns,
    '--spreadsheet-width': `${totalWidth}px`,
  };
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
    scrollMargin: HEADER_HEIGHT,
  });
  const canvasVariables: CssVariables = {
    '--spreadsheet-width': `${totalWidth}px`,
    '--spreadsheet-height': `${rowVirtualizer.getTotalSize()}px`,
  };
  const virtualRows = rowVirtualizer.getVirtualItems();
  const lastVisibleIndex = virtualRows[virtualRows.length - 1]?.index ?? -1;

  useEffect(() => {
    if (lastVisibleIndex < 0 || !hasNextPage || isFetchingNextPage) {
      return;
    }
    if (lastVisibleIndex >= rows.length - 8) {
      void fetchNextPage();
    }
  }, [lastVisibleIndex, rows.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return <PreviewSkeleton />;
  }
  if (isError || sheetError != null || error != null) {
    return <PreviewError onRetry={() => void refetch()} />;
  }
  if (sheetMetas.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-text-secondary text-sm">{localize('com_ui_no_data')}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="spreadsheet-viewer">
      <div ref={scrollRef} className="preview-scroll min-h-0 flex-1 overflow-auto">
        <div
          className={cn(widthClass, 'bg-surface-secondary sticky top-0 z-20')}
          style={gridVariables}
        >
          <div className={cn(gridClass, 'grid h-6')} style={gridVariables}>
            <div className="border-border-light bg-surface-secondary sticky left-0 z-30 border-r border-b" />
            {columns.map((_column, index) => (
              <div
                key={`letter-${index}`}
                className="border-border-light text-text-tertiary text-3xs flex items-center justify-center border-r border-b font-medium"
              >
                {columnLetter(index + 1)}
              </div>
            ))}
          </div>
          <div className={cn(gridClass, 'grid h-8')} style={gridVariables}>
            <div className="border-border-light bg-surface-secondary text-text-tertiary sticky left-0 z-30 flex items-center justify-center border-r border-b text-xs">
              #
            </div>
            {columns.map((column, index) => (
              <div
                key={`header-${column.header}-${index}`}
                className="border-border-light bg-surface-secondary text-text-primary flex items-center border-r border-b px-2 text-xs font-semibold"
                title={column.header}
              >
                <span className="truncate">{column.header}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={cn(canvasClass, 'relative')} style={canvasVariables}>
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index] ?? [];
            const excelRow = virtualRow.index + 2;
            return (
              <div
                key={virtualRow.key}
                className={cn(rowClass, 'border-border-light absolute top-0 left-0 grid border-b')}
                style={
                  {
                    ...gridVariables,
                    '--spreadsheet-row-height': `${virtualRow.size}px`,
                    '--spreadsheet-row-offset': `${virtualRow.start - HEADER_HEIGHT}px`,
                  } as CssVariables
                }
              >
                <div className="border-border-light bg-surface-secondary text-text-tertiary sticky left-0 z-10 flex items-center justify-center border-r text-xs">
                  {virtualRow.index + 1}
                </div>
                {columns.map((column, columnIndex) => {
                  const value = row[columnIndex];
                  const style = styles[`${columnLetter(columnIndex + 1)}${excelRow}`];
                  const numeric = typeof value === 'number';
                  return (
                    <div
                      key={`${virtualRow.key}-${column.header}-${columnIndex}`}
                      className={cn(
                        cellClass,
                        'border-border-light text-text-primary flex items-center overflow-hidden border-r px-2 text-xs',
                        numeric && style?.align == null ? 'justify-end' : 'justify-start',
                      )}
                      // Excel fills, fonts, and alignment are document data, expressed as CSS variables.
                      // eslint-disable-next-line shadcn/no-inline-styles
                      style={cellStyle(style)}
                      title={value != null ? String(value) : undefined}
                    >
                      <span className="truncate">{formatCell(value, style)}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {isFetchingNextPage && (
          <div className="text-text-secondary flex items-center justify-center gap-2 py-3 text-xs">
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
            {localize('com_ui_loading_more_data')}
          </div>
        )}
      </div>

      <div
        className="border-border-light bg-surface-primary flex shrink-0 items-center gap-1 overflow-x-auto border-t px-2 py-1.5"
        role="tablist"
        aria-label={localize('com_ui_generated_file_sheet_tabs')}
      >
        {sheetMetas.map((sheet) => {
          const active = sheet.index === sheetIndex;
          return (
            <button
              key={sheet.name}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setSheetIndex(sheet.index)}
              className={cn(
                'focus-visible:ring-ring-primary shrink-0 rounded-md px-2.5 py-1 text-xs transition-colors focus:outline-hidden focus-visible:ring-2',
                active
                  ? 'bg-surface-tertiary text-text-primary font-medium'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary',
              )}
            >
              {sheet.name}
              <span className="text-text-tertiary ms-1">({sheet.totalRows})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
