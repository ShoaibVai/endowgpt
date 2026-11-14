import { useRef } from 'react';
import { useSetAtom } from 'jotai';
import { HardDrive } from 'lucide-react';
import { TooltipAnchor } from '@librechat/client';
import { filesDialogTriggerAtom, showFilesDialogAtom } from '~/store/filesDialog';
import useDirection, { inlineSide } from '~/hooks/Nav/useDirection';
import { useGetDocumentStorageQuery } from '~/data-provider';
import { cn, formatFileSize } from '~/utils';
import { useLocalize } from '~/hooks';

/** Compact bottom-left rail meter. The bar under the drive icon is the usage
 *  fraction; the tooltip and accessible name carry the exact numbers. */
export default function StorageIndicator() {
  const localize = useLocalize();
  const tooltipSide = inlineSide(useDirection(), 'end');
  const setShowFiles = useSetAtom(showFilesDialogAtom);
  const setFilesDialogTrigger = useSetAtom(filesDialogTriggerAtom);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { data } = useGetDocumentStorageQuery();

  const percent =
    data != null && data.limitBytes > 0
      ? Math.min(100, Math.round((data.usedBytes / data.limitBytes) * 100))
      : 0;
  const label =
    data != null
      ? localize('com_ui_storage_usage_label', {
          0: formatFileSize(data.usedBytes),
          1: formatFileSize(data.limitBytes),
        })
      : localize('com_ui_storage');
  const fillClass =
    percent >= 100 ? 'bg-status-error' : percent >= 90 ? 'bg-status-warning' : 'bg-accent-primary';
  const percentClass =
    percent >= 100
      ? 'text-status-error'
      : percent >= 90
        ? 'text-status-warning'
        : 'text-text-secondary';

  return (
    <TooltipAnchor
      side={tooltipSide}
      description={label}
      render={
        <button
          ref={buttonRef}
          type="button"
          aria-label={label}
          data-testid="storage-indicator"
          onClick={() => {
            setFilesDialogTrigger(buttonRef);
            setShowFiles(true);
          }}
          className="hover:bg-surface-nav-hover flex h-9 w-9 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors"
        >
          <HardDrive className="text-text-primary h-4 w-4" aria-hidden="true" />
          <span className={cn('text-[9px] leading-none tabular-nums', percentClass)}>
            {percent}%
          </span>
          <span
            aria-hidden="true"
            className="bg-surface-tertiary h-0.5 w-5 overflow-hidden rounded-full"
          >
            <span
              className={cn(
                'block h-full transition-[width] motion-reduce:transition-none',
                fillClass,
              )}
              style={{ width: `${percent}%` }}
            />
          </span>
        </button>
      }
    />
  );
}
