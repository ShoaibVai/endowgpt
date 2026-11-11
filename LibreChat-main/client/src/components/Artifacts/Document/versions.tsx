import { useState } from 'react';
import { History, RotateCcw, X } from 'lucide-react';
import { Button, Spinner, useToastContext } from '@librechat/client';
import type { TDocumentVersionContent } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import {
  useGetDocumentQuery,
  useGetDocumentVersionQuery,
  useRestoreDocumentMutation,
} from '~/data-provider';
import { formatDate } from '~/utils/files';
import { useLocalize } from '~/hooks';

/** The document versions drawer (PLAN.md §7.1): snapshots live in Mongo, one
 *  entry per save. Restoring adopts the chosen version and appends the
 *  pre-restore state as a new snapshot — history is never rewritten. */

export default function VersionsDrawer({
  conversationId,
  artifactId,
  onClose,
  onRestored,
}: {
  conversationId: string;
  artifactId: string;
  onClose: () => void;
  /** Hands the restored markdown and its new version id to the editor. */
  onRestored: (markdown: string, versionId: string) => void;
}) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);

  const { data: document, isLoading } = useGetDocumentQuery(conversationId, artifactId, {
    staleTime: 0,
  });

  const { data: versionPreview, isFetching: previewLoading } = useGetDocumentVersionQuery(
    conversationId,
    artifactId,
    selectedVersionId ?? '',
    { enabled: selectedVersionId != null },
  );

  const restore = useRestoreDocumentMutation(conversationId, artifactId, {
    onSuccess: (data) => {
      onRestored(data.content, data.versionId);
      showToast({ status: 'success', message: localize('com_ui_document_restored') });
    },
    onError: () => {
      showToast({ status: 'error', message: localize('com_error_document_restore_failed') });
    },
  });

  const versions = document?.versions ?? [];
  const newestFirst = [...versions].reverse();

  let body: ReactNode;
  if (isLoading) {
    body = (
      <div className="flex h-24 items-center justify-center" aria-busy="true">
        <Spinner className="size-5" />
      </div>
    );
  } else if (newestFirst.length === 0) {
    body = (
      <p className="text-text-secondary px-2 text-sm">{localize('com_ui_document_no_versions')}</p>
    );
  } else {
    body = (
      <ul className="flex flex-col gap-1">
        {newestFirst.map((version) => (
          <li key={version.id}>
            <button
              type="button"
              onClick={() =>
                setSelectedVersionId((current) => (current === version.id ? null : version.id))
              }
              aria-expanded={selectedVersionId === version.id}
              className="hover:bg-surface-hover w-full rounded-lg px-2 py-1.5 text-start text-sm"
            >
              <span className="text-text-primary block truncate">{version.title}</span>
              <span className="text-text-secondary block text-xs">
                {formatDate(new Date(version.createdAt).toISOString())} · {version.source}
              </span>
            </button>
            {selectedVersionId === version.id && (
              <div className="bg-surface-primary mt-1 rounded-lg p-2">
                {previewLoading ? (
                  <div className="flex h-12 items-center justify-center" aria-busy="true">
                    <Spinner className="size-4" />
                  </div>
                ) : (
                  <pre className="text-text-secondary max-h-40 overflow-y-auto text-xs whitespace-pre-wrap">
                    {(versionPreview as TDocumentVersionContent | undefined)?.content?.slice(
                      0,
                      600,
                    )}
                  </pre>
                )}
                <Button
                  variant="submit"
                  className="mt-2 h-8 w-full"
                  onClick={() => restore.mutate(version.id)}
                  disabled={restore.isLoading}
                >
                  <RotateCcw className="size-4" aria-hidden="true" />
                  {localize('com_ui_document_restore')}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div
      className="border-border-light bg-surface-primary-alt absolute end-0 top-0 bottom-0 z-30 flex w-80 flex-col border-s"
      role="dialog"
      aria-label={localize('com_ui_document_versions')}
      data-testid="endow-versions-drawer"
    >
      <div className="border-border-light flex items-center justify-between border-b p-2">
        <span className="text-text-primary flex items-center gap-2 text-sm font-medium">
          <History className="size-4" aria-hidden="true" />
          {localize('com_ui_document_versions')}
        </span>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={onClose}
          aria-label={localize('com_ui_close')}
        >
          <X className="size-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="min-h-0 grow overflow-y-auto p-2">{body}</div>
      <p className="text-text-secondary border-border-light border-t p-2 text-xs">
        {localize('com_ui_document_restore_warning')}
      </p>
    </div>
  );
}
