import { useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { FileSources, FileContext } from 'librechat-data-provider';
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  Progress,
  Skeleton,
} from '@librechat/client';
import type { TFile } from 'librechat-data-provider';
import { useGetDocumentStorageQuery, useGetFiles } from '~/data-provider';
import { DataTable, columns } from './Table';
import { formatFileSize } from '~/utils';
import { useLocalize } from '~/hooks';

export function MyFilesModal({
  open,
  onOpenChange,
  triggerRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef?: React.RefObject<HTMLElement | null>;
}) {
  const localize = useLocalize();
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const {
    data: storage,
    isLoading: storageLoading,
    isError: storageError,
  } = useGetDocumentStorageQuery();

  const captureReturnFocus = useCallback(() => {
    const activeElement = document.activeElement;
    const canRestoreShortcutFocus =
      activeElement instanceof HTMLElement &&
      activeElement !== document.body &&
      activeElement.isConnected &&
      activeElement.closest('[inert]') == null &&
      activeElement.closest('[role="menu"]') == null;
    returnFocusRef.current = canRestoreShortcutFocus
      ? activeElement
      : (triggerRef?.current ?? null);
  }, [triggerRef]);

  const { data: files = [] } = useGetFiles<TFile[]>({
    select: (files) =>
      files.map((file) => {
        file.context = file.context ?? FileContext.unknown;
        file.filterSource = file.source === FileSources.firebase ? FileSources.local : file.source;
        return file;
      }),
  });

  return (
    <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={returnFocusRef}>
      <OGDialogContent
        title={localize('com_nav_my_files')}
        onOpenAutoFocus={captureReturnFocus}
        className="text-text-primary w-11/12 shadow-2xl"
      >
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_nav_my_files')}</OGDialogTitle>
        </OGDialogHeader>
        <div className="border-border-light bg-surface-secondary mb-4 flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">{localize('com_ui_storage')}</span>
            {storage != null ? (
              <span className="text-text-secondary text-xs tabular-nums">
                {localize('com_ui_storage_usage', {
                  0: formatFileSize(storage.usedBytes),
                  1: formatFileSize(storage.limitBytes),
                })}
              </span>
            ) : null}
          </div>
          {storageLoading ? (
            <Skeleton className="h-2 w-full" />
          ) : storageError || storage == null ? (
            <p className="text-text-secondary text-xs">{localize('com_ui_storage_unavailable')}</p>
          ) : (
            <>
              <Progress
                value={
                  storage.limitBytes > 0
                    ? Math.min(100, Math.round((storage.usedBytes / storage.limitBytes) * 100))
                    : 0
                }
                variant={
                  storage.usedBytes >= storage.limitBytes
                    ? 'error'
                    : storage.usedBytes / storage.limitBytes >= 0.9
                      ? 'warning'
                      : 'default'
                }
                aria-label={localize('com_ui_storage_usage_label', {
                  0: formatFileSize(storage.usedBytes),
                  1: formatFileSize(storage.limitBytes),
                })}
              />
              <span className="text-text-secondary text-xs">
                {storage.usedBytes >= storage.limitBytes
                  ? localize('com_ui_storage_full')
                  : localize('com_ui_storage_hint')}
              </span>
            </>
          )}
        </div>
        <DataTable columns={columns} data={files} />
        <div className="mt-4 flex justify-end">
          <Link
            to="/documents"
            onClick={() => onOpenChange(false)}
            className="text-accent-primary text-xs font-medium hover:underline"
          >
            {localize('com_ui_storage_manage_documents')}
          </Link>
        </div>
      </OGDialogContent>
    </OGDialog>
  );
}
