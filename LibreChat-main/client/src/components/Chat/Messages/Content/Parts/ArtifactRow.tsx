import { forwardRef } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@librechat/client';
import {
  ARTIFACT_ROW_NAV_SPACING,
  ROW_GLYPH_SLOT,
  TOOL_ROW_CLASSES,
} from '@librechat/chat/components';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface ArtifactRowProps {
  /** The document title shown to the reader. */
  title: string;
  /** This document is the one the panel is currently showing. */
  isSelected: boolean;
  onOpen: () => void;
  /** Stable trigger id, for the panel's focus handoff and for e2e. */
  artifactId?: string;
}

/**
 * Chat-side trigger for an editable document. Generated files use `FileCard`
 * instead; this row is deliberately document-only.
 */
const ArtifactRow = forwardRef<HTMLButtonElement, ArtifactRowProps>(function ArtifactRow(
  { title, isSelected, onOpen, artifactId },
  ref,
) {
  const localize = useLocalize();
  const actionLabel = isSelected
    ? localize('com_ui_close_document')
    : localize('com_ui_open_document');

  return (
    <div className={cn(TOOL_ROW_CLASSES, 'text-text-secondary text-sm', ARTIFACT_ROW_NAV_SPACING)}>
      <Button
        ref={ref}
        type="button"
        variant="disclosure"
        aria-controls="artifact-viewer"
        aria-expanded={isSelected}
        data-artifact-trigger={artifactId}
        onClick={onOpen}
        className={cn(
          'min-w-0 flex-1 gap-2.5',
          'hover:text-text-primary focus-visible:ring-text-primary focus-visible:ring-offset-0',
          isSelected && 'text-text-primary',
        )}
      >
        <span className={cn(ROW_GLYPH_SLOT, 'text-status-info')} aria-hidden="true">
          <FileText className="size-4 shrink-0" />
        </span>
        <span className="min-w-0 truncate font-medium" title={title}>
          {title}
        </span>
        <span className="text-text-tertiary ring-border-light text-3xs shrink-0 rounded px-1.5 leading-5 font-medium tracking-wide uppercase ring-1 ring-inset">
          {localize('com_ui_artifact_format_document')}
        </span>
        <span className="sr-only">{actionLabel}</span>
      </Button>
    </div>
  );
});

export default ArtifactRow;
