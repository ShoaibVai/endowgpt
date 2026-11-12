import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';

export function PreviewSkeleton({ rows = 10 }: { rows?: number }) {
  return (
    <div className="flex h-full flex-col gap-2 p-4" data-testid="file-preview-skeleton">
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="bg-surface-tertiary h-7 animate-pulse rounded"
          style={{ width: `${58 + ((index * 13) % 38)}%` }}
        />
      ))}
    </div>
  );
}

export function PreviewError({ onRetry }: { onRetry: () => void }) {
  const localize = useLocalize();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-text-secondary text-sm">{localize('com_ui_preview_failed')}</p>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        {localize('com_ui_retry')}
      </Button>
    </div>
  );
}

export function PreviewUnavailable() {
  const localize = useLocalize();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-text-secondary text-sm">{localize('com_ui_preview_unavailable')}</p>
      <p className="text-text-tertiary max-w-sm text-xs">
        {localize('com_ui_generated_file_download_hint')}
      </p>
    </div>
  );
}
