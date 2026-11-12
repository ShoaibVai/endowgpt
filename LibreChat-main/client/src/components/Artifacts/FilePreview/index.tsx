import { Suspense } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { FileSpreadsheet, FileText, Presentation } from 'lucide-react';
import type { Artifact } from '~/common';
import { useLocalize } from '~/hooks';
import { useShareContext } from '~/Providers';
import { useMessagePartsHost } from '~/Providers/MessagePartsHostContext';
import { lazyWithRecovery } from '~/lib/assets/lazy';
import { cn } from '~/utils';
import {
  generatedFileFormatLabel,
  generatedFileKindLabelKey,
  generatedFileVisualKind,
} from '~/utils/generatedFiles';
import { displayFilename } from '~/components/Chat/Messages/Content/Parts/attachmentTypes';
import GeneratedFileTabs from '../GeneratedFileTabs';
import { PreviewSkeleton } from './States';

const SpreadsheetViewer = lazyWithRecovery(() => import('./SpreadsheetViewer'));
const DocxViewer = lazyWithRecovery(() => import('./DocxViewer'));
const MarkdownViewer = lazyWithRecovery(() => import('./MarkdownViewer'));
const PptxViewer = lazyWithRecovery(() => import('./PptxViewer'));

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

export default function FilePreview({ artifact }: { artifact: Artifact }) {
  const localize = useLocalize();
  const { useUser } = useMessagePartsHost();
  const user = useUser();
  const { shareId } = useShareContext();
  const metadata = artifact.download?.generatedFile;
  const fileId = artifact.download?.file_id;
  const filename = displayFilename(artifact.title) || localize('com_ui_file');
  const format = metadata?.format ?? filename.split('.').pop()?.toLowerCase() ?? '';
  const visualKind = metadata ? generatedFileVisualKind(metadata) : 'markdown';
  const { Icon, tile } = VISUALS[visualKind];
  const detail = metadata
    ? `${generatedFileFormatLabel(metadata)} · ${localize(generatedFileKindLabelKey(metadata))}`
    : format.toUpperCase();

  let viewer: React.ReactNode;
  if (format === 'xlsx' || format === 'csv') {
    viewer = <SpreadsheetViewer fileId={fileId} />;
  } else if (format === 'docx') {
    viewer = <DocxViewer userId={user?.id} fileId={fileId} shareId={shareId} />;
  } else if (format === 'md') {
    viewer = <MarkdownViewer userId={user?.id} fileId={fileId} shareId={shareId} />;
  } else if (format === 'pptx') {
    viewer = <PptxViewer fileId={fileId} shareId={shareId} />;
  } else {
    viewer = <GeneratedFileTabs artifact={artifact} />;
  }

  return (
    <Tabs.Content
      value="preview"
      className="flex h-full w-full flex-col overflow-hidden"
      tabIndex={-1}
    >
      <div className="border-border-light bg-surface-primary flex shrink-0 items-center gap-3 border-b px-4 py-2.5">
        <span
          className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', tile)}
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-text-primary truncate text-sm font-medium" title={filename}>
            {filename}
          </p>
          <p className="text-text-secondary truncate text-xs">{detail}</p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <Suspense fallback={<PreviewSkeleton rows={10} />}>{viewer}</Suspense>
      </div>
    </Tabs.Content>
  );
}
