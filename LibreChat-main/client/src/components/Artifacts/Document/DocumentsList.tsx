import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Button, Spinner, useToastContext } from '@librechat/client';
import { ArrowLeft, FileText, Trash2 } from 'lucide-react';
import { useGetDocumentsQuery, useDeleteDocumentMutation } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { formatDate } from '~/utils/files';

/** `/documents` — every store-backed document the user owns, newest first.
 *  Each row opens the full-page editor; delete is immediate with a toast. */
export default function DocumentsList() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { data: documents, isLoading } = useGetDocumentsQuery();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const deleteDocument = useDeleteDocumentMutation();

  const handleDelete = (conversationId: string, artifactId: string) => {
    setDeletingId(artifactId);
    deleteDocument.mutate(
      { conversationId, artifactId },
      {
        onSettled: () => setDeletingId(null),
        onSuccess: () => {
          showToast({ status: 'success', message: localize('com_ui_document_deleted') });
        },
        onError: () => {
          showToast({ status: 'error', message: localize('com_error_document_save_failed') });
        },
      },
    );
  };

  return (
    <div className="bg-surface-primary text-text-primary mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{localize('com_ui_documents')}</h1>
        <Button
          size="sm"
          variant="ghost"
          className="gap-2"
          onClick={() => history.back()}
          aria-label={localize('com_ui_back_to_chat')}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {localize('com_ui_back_to_chat')}
        </Button>
      </div>

      {isLoading ? (
        <div className="flex h-40 items-center justify-center" aria-busy="true">
          <Spinner className="size-6" />
        </div>
      ) : (documents ?? []).length === 0 ? (
        <p className="text-text-secondary text-sm">
          {localize('com_ui_documents_empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {(documents ?? []).map((doc) => (
            <li key={`${doc.conversationId}:${doc.artifactId}`}>
              <div className="border-border-light bg-surface-secondary hover:bg-surface-hover flex items-center justify-between rounded-lg border p-3">
                <Link
                  to={`/documents/${encodeURIComponent(doc.conversationId)}/${encodeURIComponent(doc.artifactId)}`}
                  className="flex min-w-0 items-center gap-3"
                >
                  <FileText className="text-accent-primary size-5 shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{doc.title}</span>
                    <span className="text-text-secondary block text-xs">
                      {formatDate(new Date(doc.updatedAt).toISOString())} ·{' '}
                      {doc.versionCount} {localize('com_ui_document_versions')}
                    </span>
                  </span>
                </Link>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  disabled={deletingId === doc.artifactId}
                  aria-label={localize('com_ui_delete')}
                  onClick={() => void handleDelete(doc.conversationId, doc.artifactId)}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
