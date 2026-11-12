import { memo } from 'react';
import { Button } from '@librechat/client';
import { Download, FileSpreadsheet, FileText, Presentation } from 'lucide-react';
import type { Artifact } from '~/common';
import { useLocalize } from '~/hooks';
import { formatFileSize } from '~/utils/files';
import { generatedFileFormatLabel, generatedFileVisualKind } from '~/utils/generatedFiles';
import { cn } from '~/utils';
import { displayFilename } from './attachmentTypes';

const VISUAL_KINDS = {
  spreadsheet: {
    Icon: FileSpreadsheet,
    tile: 'bg-status-success-subtle text-status-success',
  },
  document: {
    Icon: FileText,
    tile: 'bg-status-info-subtle text-status-info',
  },
  presentation: {
    Icon: Presentation,
    tile: 'bg-status-warning-subtle text-status-warning',
  },
  markdown: {
    Icon: FileText,
    tile: 'bg-surface-tertiary text-text-secondary',
  },
} as const;

interface FileCardProps {
  artifact: Artifact;
  isSelected: boolean;
  onOpen: () => void;
  onDownload: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

/**
 * Chat-side card for a native file-generation tool result. Open focuses the
 * side panel; Download uses the same attachment route as every other file
 * chip, so it always returns the original binary rather than a preview.
 */
const FileCard = memo(function FileCard({
  artifact,
  isSelected,
  onOpen,
  onDownload,
}: FileCardProps) {
  const localize = useLocalize();
  const generatedFile = artifact.download?.generatedFile;
  const filename = displayFilename(artifact.title) || localize('com_ui_file');
  const visualKind = generatedFile ? generatedFileVisualKind(generatedFile) : 'markdown';
  const { Icon, tile } = VISUAL_KINDS[visualKind];
  const formatLabel = generatedFile
    ? generatedFileFormatLabel(generatedFile)
    : (filename.split('.').pop()?.toUpperCase() ?? 'FILE');
  const parts = [formatLabel];

  if (generatedFile?.kind === 'spreadsheet') {
    if (generatedFile.sheets != null) {
      parts.push(
        localize('com_ui_generated_file_sheets', {
          count: generatedFile.sheets,
          0: generatedFile.sheets,
        }),
      );
    }
    if (generatedFile.rows != null) {
      parts.push(
        localize('com_ui_generated_file_rows', {
          count: generatedFile.rows,
          0: generatedFile.rows,
        }),
      );
    }
  } else if (generatedFile?.kind === 'presentation') {
    if (generatedFile.slides != null) {
      parts.push(
        localize('com_ui_generated_file_slides', {
          count: generatedFile.slides,
          0: generatedFile.slides,
        }),
      );
    }
  } else if (generatedFile?.kind === 'document') {
    if (generatedFile.blocks != null) {
      parts.push(
        localize('com_ui_generated_file_blocks', {
          count: generatedFile.blocks,
          0: generatedFile.blocks,
        }),
      );
    }
  } else if (artifact.download?.bytes != null) {
    parts.push(formatFileSize(artifact.download.bytes));
  }

  return (
    <div
      data-testid="generated-file-card"
      className="border-border-light bg-surface-secondary hover:border-border-medium hover:bg-surface-tertiary group flex w-full max-w-xl items-center gap-3 rounded-xl border p-3 transition-colors"
    >
      <span
        className={cn('flex size-11 shrink-0 items-center justify-center rounded-lg', tile)}
        aria-hidden="true"
      >
        <Icon className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-text-primary truncate text-sm font-medium" title={filename}>
          {filename}
        </div>
        <div data-testid="generated-file-meta" className="text-text-secondary truncate text-xs">
          {parts.join(' · ')}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onOpen}
          aria-controls="artifact-viewer"
          aria-expanded={isSelected}
          data-artifact-trigger={artifact.id}
        >
          {localize('com_ui_generated_file_open')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDownload}
          aria-label={`${localize('com_ui_download')} ${filename}`}
          className="size-8"
        >
          <Download className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
});

FileCard.displayName = 'FileCard';

export default FileCard;
