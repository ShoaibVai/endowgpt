import { useEffect, useState } from 'react';
import { OGDialog, OGDialogContent, OGDialogTitle, Input, Spinner } from '@librechat/client';
import type { TSuperAdminDocument } from 'librechat-data-provider';
import { useSuperAdminDocumentQuery, useSuperAdminDocumentsQuery } from '~/data-provider';
import type { Localize } from './panels';
import { EmptyState, Pagination, Panel } from './panels';
import { formatDateTime, formatNumber } from './format';

const PAGE_SIZE = 25;
const SEARCH_DELAY_MS = 350;

export default function Documents({
  enabled,
  localize,
  locale,
}: {
  enabled: boolean;
  localize: Localize;
  locale: string;
}) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<TSuperAdminDocument | null>(null);

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === search) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setSearch(trimmed);
      setPage(1);
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [search, searchInput]);

  const documentsQuery = useSuperAdminDocumentsQuery(
    { page, pageSize: PAGE_SIZE, search },
    { enabled },
  );

  const documents = documentsQuery.data?.documents ?? [];

  let content: React.ReactNode;
  if (documentsQuery.isLoading) {
    content = (
      <Panel className="flex min-h-40 items-center justify-center">
        <Spinner tone="secondary" className="size-6" />
      </Panel>
    );
  } else if (documentsQuery.isError) {
    content = <EmptyState message={localize('com_superadmin_load_error')} />;
  } else if (documents.length === 0) {
    content = <EmptyState message={localize('com_superadmin_no_documents')} />;
  } else {
    content = (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[58rem] text-start text-sm">
          <thead className="border-border-medium text-text-secondary border-b text-xs">
            <tr>
              <th className="px-2 py-2 font-medium">{localize('com_superadmin_document')}</th>
              <th className="px-2 py-2 font-medium">{localize('com_superadmin_owner')}</th>
              <th className="px-2 py-2 font-medium">{localize('com_superadmin_conversation')}</th>
              <th className="px-2 py-2 text-end font-medium">
                {localize('com_superadmin_versions')}
              </th>
              <th className="px-2 py-2 text-end font-medium">
                {localize('com_superadmin_updated')}
              </th>
              <th className="px-2 py-2 text-end font-medium">
                <span className="sr-only">{localize('com_superadmin_view_document')}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-border-light divide-y">
            {documents.map((document) => (
              <tr key={`${document.userId}:${document.conversationId}:${document.artifactId}`}>
                <td className="text-text-primary max-w-[20rem] px-2 py-3">
                  <div className="truncate font-medium">{document.title}</div>
                  <div className="text-text-secondary truncate text-xs">{document.artifactId}</div>
                </td>
                <td className="max-w-[16rem] px-2 py-3">
                  <div className="text-text-primary truncate">
                    {document.userName || localize('com_superadmin_unknown_user')}
                  </div>
                  <div className="text-text-secondary truncate text-xs">{document.userEmail}</div>
                </td>
                <td className="text-text-secondary max-w-[14rem] truncate px-2 py-3 font-mono text-xs">
                  {document.conversationId}
                </td>
                <td className="px-2 py-3 text-end tabular-nums">
                  {formatNumber(document.versionCount, locale)}
                </td>
                <td className="text-text-secondary px-2 py-3 text-end whitespace-nowrap">
                  {formatDateTime(document.updatedAt, locale)}
                </td>
                <td className="px-2 py-3 text-end">
                  <button
                    type="button"
                    onClick={() => setSelected(document)}
                    className="border-border-medium hover:bg-surface-hover rounded-md border px-3 py-1.5 text-xs whitespace-nowrap"
                  >
                    {localize('com_superadmin_view_document')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <Panel className="flex flex-col gap-3 overflow-hidden">
      <label
        className="text-text-secondary block text-xs font-medium"
        htmlFor="superadmin-doc-search"
      >
        {localize('com_superadmin_search_documents')}
      </label>
      <Input
        id="superadmin-doc-search"
        value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
        placeholder={localize('com_superadmin_search_documents')}
        aria-label={localize('com_superadmin_search_documents')}
      />
      {content}
      <Pagination
        page={documentsQuery.data?.page ?? page}
        pages={documentsQuery.data?.pages ?? 1}
        isFetching={documentsQuery.isFetching}
        onPageChange={setPage}
        localize={localize}
      />
      <DocumentViewer
        document={selected}
        open={selected != null}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
          }
        }}
        localize={localize}
        locale={locale}
      />
    </Panel>
  );
}

function DocumentViewer({
  document,
  open,
  onOpenChange,
  localize,
  locale,
}: {
  document: TSuperAdminDocument | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localize: Localize;
  locale: string;
}) {
  const detailQuery = useSuperAdminDocumentQuery(
    document?.userId ?? null,
    document?.conversationId ?? null,
    document?.artifactId ?? null,
    { enabled: open && document != null },
  );
  const detail = detailQuery.data;

  let body: React.ReactNode;
  if (detailQuery.isLoading) {
    body = (
      <div className="flex min-h-40 items-center justify-center">
        <Spinner tone="secondary" className="size-6" />
      </div>
    );
  } else if (detailQuery.isError) {
    body = <EmptyState message={localize('com_superadmin_load_error')} />;
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <pre className="text-text-primary font-mono text-xs break-words whitespace-pre-wrap">
          {detail?.content ?? ''}
        </pre>
        {detail != null && detail.versions.length > 0 && (
          <section className="border-border-light border-t pt-3">
            <h3 className="text-text-primary mb-2 text-sm font-medium">
              {localize('com_superadmin_versions')}
            </h3>
            <ul className="text-text-secondary space-y-1 text-xs">
              {detail.versions.map((version) => (
                <li key={version.id} className="flex justify-between gap-3">
                  <span>{formatDateTime(new Date(version.createdAt).toISOString(), locale)}</span>
                  <span>{version.source}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="flex max-h-[90vh] w-[95vw] max-w-4xl flex-col overflow-hidden p-0">
        <div className="border-border-light flex min-w-0 flex-col gap-1 border-b px-5 py-4">
          <OGDialogTitle className="text-base font-semibold">
            {detail?.title || document?.title || localize('com_superadmin_document')}
          </OGDialogTitle>
          <div className="text-text-secondary text-xs">
            {(detail?.userName || document?.userName) ?? localize('com_superadmin_unknown_user')}
            {' | '}
            {formatDateTime(detail?.updatedAt ?? document?.updatedAt ?? null, locale)}
            {' | '}
            {localize('com_superadmin_versions')}:{' '}
            {formatNumber(detail?.versionCount ?? document?.versionCount ?? 0, locale)}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{body}</div>
      </OGDialogContent>
    </OGDialog>
  );
}
