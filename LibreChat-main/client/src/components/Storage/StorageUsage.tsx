import { useRef, useState } from 'react';
import { useSetAtom } from 'jotai';
import { HardDrive } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Progress, Skeleton } from '@librechat/client';
import { MyFilesModal } from '~/components/Chat/Input/Files/MyFilesModal';
import { settingsOpenAtom } from '~/components/Nav/Settings';
import { useGetDocumentStorageQuery } from '~/data-provider';
import { formatFileSize } from '~/utils';
import { useLocalize } from '~/hooks';

/** Storage row for the Profile settings section. Shares the usage query with
 *  the sidebar indicator, so both surfaces stay in step. */
export default function StorageUsage() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const setShowSettings = useSetAtom(settingsOpenAtom);
  const [filesOpen, setFilesOpen] = useState(false);
  const filesButtonRef = useRef<HTMLButtonElement>(null);
  const { data, isLoading, isError } = useGetDocumentStorageQuery();

  const percent =
    data != null && data.limitBytes > 0
      ? Math.min(100, Math.round((data.usedBytes / data.limitBytes) * 100))
      : 0;
  const variant: 'default' | 'warning' | 'error' =
    percent >= 100 ? 'error' : percent >= 90 ? 'warning' : 'default';
  const usageText =
    data != null
      ? localize('com_ui_storage_usage', {
          0: formatFileSize(data.usedBytes),
          1: formatFileSize(data.limitBytes),
        })
      : '';
  const usageLabel =
    data != null
      ? localize('com_ui_storage_usage_label', {
          0: formatFileSize(data.usedBytes),
          1: formatFileSize(data.limitBytes),
        })
      : localize('com_ui_storage');

  return (
    <>
      <div className="flex flex-col gap-3" data-testid="storage-usage">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 font-medium">
            <HardDrive className="size-4" aria-hidden="true" />
            <span>{localize('com_ui_storage')}</span>
          </div>
          {usageText ? (
            <span className="text-text-secondary text-end text-xs tabular-nums">{usageText}</span>
          ) : null}
        </div>

        {isLoading ? (
          <Skeleton className="h-2 w-full" />
        ) : isError || data == null ? (
          <p className="text-text-secondary text-xs">{localize('com_ui_storage_unavailable')}</p>
        ) : (
          <>
            <Progress value={percent} variant={variant} aria-label={usageLabel} />
            <div className="text-text-secondary flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span>
                {localize('com_ui_storage_documents')}: {formatFileSize(data.documentBytes)}
              </span>
              <span>
                {localize('com_ui_storage_generated_files')}:{' '}
                {formatFileSize(data.generatedFileBytes)}
              </span>
            </div>
            {data.usedBytes >= data.limitBytes ? (
              <p role="alert" className="text-status-error text-xs">
                {localize('com_ui_storage_full')}
              </p>
            ) : (
              <p className="text-text-secondary text-xs">{localize('com_ui_storage_hint')}</p>
            )}
          </>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            ref={filesButtonRef}
            size="sm"
            variant="outline"
            onClick={() => setFilesOpen(true)}
          >
            {localize('com_ui_storage_manage_files')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setShowSettings(false);
              navigate('/documents');
            }}
          >
            {localize('com_ui_storage_manage_documents')}
          </Button>
        </div>
      </div>
      <MyFilesModal open={filesOpen} onOpenChange={setFilesOpen} triggerRef={filesButtonRef} />
    </>
  );
}
