import * as Tabs from '@radix-ui/react-tabs';
import { FileSpreadsheet, FileText, Presentation } from 'lucide-react';
import type { Artifact } from '~/common';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import {
  generatedFileFormatLabel,
  generatedFileKindLabelKey,
  generatedFileVisualKind,
} from '~/utils/generatedFiles';
import { displayFilename } from '~/components/Chat/Messages/Content/Parts/attachmentTypes';

const VISUALS = {
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

/**
 * Interim file preview shell. The Phase 3 viewers replace the hint with the
 * spreadsheet grid, docx pages, or PDF viewer while keeping this panel chrome.
 */
export default function GeneratedFileTabs({ artifact }: { artifact: Artifact }) {
  const localize = useLocalize();
  const metadata = artifact.download?.generatedFile;
  const visualKind = metadata ? generatedFileVisualKind(metadata) : 'markdown';
  const { Icon, tile } = VISUALS[visualKind];
  const filename = displayFilename(artifact.title) || localize('com_ui_file');
  const detail = metadata
    ? `${generatedFileFormatLabel(metadata)} · ${localize(generatedFileKindLabelKey(metadata))}`
    : filename.split('.').pop()?.toUpperCase();

  return (
    <Tabs.Content
      value="preview"
      className="flex h-full w-full flex-col items-center justify-center gap-4 p-6 text-center"
      tabIndex={-1}
    >
      <span
        className={cn('flex size-14 items-center justify-center rounded-2xl', tile)}
        aria-hidden="true"
      >
        <Icon className="size-7" />
      </span>
      <div className="max-w-sm space-y-1">
        <p className="text-text-primary truncate text-sm font-medium" title={filename}>
          {filename}
        </p>
        {detail != null && <p className="text-text-secondary text-xs">{detail}</p>}
      </div>
      <p className="text-text-tertiary max-w-sm text-sm">
        {localize('com_ui_generated_file_download_hint')}
      </p>
    </Tabs.Content>
  );
}
