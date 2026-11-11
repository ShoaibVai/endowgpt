import { useParams } from 'react-router-dom';
import { Link } from 'react-router-dom';
import * as Tabs from '@radix-ui/react-tabs';
import { Button, Spinner } from '@librechat/client';
import { ArrowLeft } from 'lucide-react';
import { useGetDocumentQuery } from '~/data-provider';
import type { Artifact } from '~/common';
import { TOOL_ARTIFACT_TYPES } from '~/utils/artifacts';
import { useLocalize } from '~/hooks';
import DocumentArtifactTabs from './index';

/** `/documents/:conversationId/:artifactId` — the full-page editor. Fetches the
 *  store-backed document and mounts the same editor the artifact panel uses,
 *  wrapped in a Tabs.Root so the editor's tab contents have their context. */
export default function DocumentPage() {
  const localize = useLocalize();
  const { conversationId = '', artifactId = '' } = useParams();

  const { data: document, isLoading, isError } = useGetDocumentQuery(
    conversationId,
    artifactId,
    { staleTime: 0, retry: false },
  );

  const artifact: Artifact | null = document
    ? {
        id: document.artifactId,
        lastUpdateTime: Date.now(),
        index: 0,
        messageId: '',
        title: document.title,
        type: TOOL_ARTIFACT_TYPES.DOCUMENT,
        content: document.content,
      }
    : null;

  return (
    <div className="bg-surface-primary text-text-primary flex h-screen flex-col">
      <div className="border-border-light flex items-center justify-between border-b px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            onClick={() => history.back()}
            aria-label={localize('com_ui_back_to_chat')}
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
          </Button>
          <h1 className="truncate text-lg font-medium">{document?.title ?? artifactId}</h1>
        </div>
        <Link
          to={`/c/${conversationId}`}
          className="text-accent-primary hover:underline text-sm"
        >
          {localize('com_ui_back_to_chat')}
        </Link>
      </div>

      <div className="relative min-h-0 grow">
        {isLoading ? (
          <div className="flex h-full items-center justify-center" aria-busy="true">
            <Spinner className="size-6" />
          </div>
        ) : isError || document == null ? (
          <p className="text-text-secondary flex h-full items-center justify-center text-sm">
            {localize('com_error_document_load_failed')}
          </p>
        ) : artifact != null ? (
          <Tabs.Root value="preview" asChild>
            <div className="flex h-full w-full flex-col">
              <DocumentArtifactTabs
                artifact={artifact}
                conversationId={conversationId}
              />
            </div>
          </Tabs.Root>
        ) : null}
      </div>
    </div>
  );
}
