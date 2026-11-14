import { useEffect, useState } from 'react';
import { Input, Spinner } from '@librechat/client';
import { useSuperAdminAuditQuery } from '~/data-provider';
import type { Localize } from './panels';
import { EmptyState, Pagination, Panel } from './panels';
import { formatDateTime } from './format';

const PAGE_SIZE = 25;
const SEARCH_DELAY_MS = 350;

function responseStatus(error: unknown) {
  return (error as { response?: { status?: number } } | undefined)?.response?.status;
}

export default function Audit({
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

  const auditQuery = useSuperAdminAuditQuery({ page, pageSize: PAGE_SIZE, search }, { enabled });
  const entries = auditQuery.data?.entries ?? [];
  const total = auditQuery.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const forbidden = responseStatus(auditQuery.error) === 403;

  let content: React.ReactNode;
  if (auditQuery.isLoading) {
    content = (
      <Panel className="flex min-h-40 items-center justify-center">
        <Spinner tone="secondary" className="size-6" />
      </Panel>
    );
  } else if (forbidden) {
    content = <EmptyState message={localize('com_superadmin_audit_forbidden')} />;
  } else if (auditQuery.isError) {
    content = <EmptyState message={localize('com_superadmin_load_error')} />;
  } else if (entries.length === 0) {
    content = <EmptyState message={localize('com_superadmin_no_audit')} />;
  } else {
    content = (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-start text-sm">
          <thead className="border-border-medium text-text-secondary border-b text-xs">
            <tr>
              <th className="px-2 py-2 font-medium">{localize('com_superadmin_audit_time')}</th>
              <th className="px-2 py-2 font-medium">{localize('com_superadmin_audit_actor')}</th>
              <th className="px-2 py-2 font-medium">{localize('com_superadmin_audit_action')}</th>
              <th className="px-2 py-2 font-medium">{localize('com_superadmin_audit_target')}</th>
              <th className="px-2 py-2 font-medium">{localize('com_superadmin_audit_outcome')}</th>
              <th className="px-2 py-2 font-medium">{localize('com_superadmin_audit_severity')}</th>
            </tr>
          </thead>
          <tbody className="divide-border-light divide-y">
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td className="text-text-secondary px-2 py-3 whitespace-nowrap">
                  {formatDateTime(entry.timestamp, locale)}
                </td>
                <td className="text-text-primary max-w-[14rem] truncate px-2 py-3">
                  {entry.actor.name}
                </td>
                <td className="max-w-[16rem] px-2 py-3">
                  <div className="text-text-primary truncate font-mono text-xs">{entry.action}</div>
                  <div className="text-text-secondary truncate text-xs">{entry.category}</div>
                </td>
                <td className="text-text-secondary max-w-[14rem] px-2 py-3">
                  <div className="truncate">{entry.target.type}</div>
                  {entry.target.name && (
                    <div className="text-text-primary truncate text-xs">{entry.target.name}</div>
                  )}
                </td>
                <td className="text-text-secondary px-2 py-3">{entry.outcome}</td>
                <td className="text-text-secondary px-2 py-3">{entry.severity}</td>
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
        htmlFor="superadmin-audit-search"
      >
        {localize('com_superadmin_search_audit')}
      </label>
      <Input
        id="superadmin-audit-search"
        value={searchInput}
        onChange={(event) => setSearchInput(event.target.value)}
        placeholder={localize('com_superadmin_search_audit')}
        aria-label={localize('com_superadmin_search_audit')}
      />
      {content}
      <Pagination
        page={page}
        pages={pages}
        isFetching={auditQuery.isFetching}
        onPageChange={setPage}
        localize={localize}
      />
    </Panel>
  );
}
