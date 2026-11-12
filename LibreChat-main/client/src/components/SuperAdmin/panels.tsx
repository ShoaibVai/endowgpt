import { Button, Spinner } from '@librechat/client';
import type {
  TSuperAdminDailyPoint,
  TSuperAdminModelUsage,
  TSuperAdminUser,
} from 'librechat-data-provider';
import type { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { formatDate, formatDateTime, formatNumber } from './format';

export type Localize = ReturnType<typeof useLocalize>;

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        'border-chart-widget-stroke bg-chart-widget-surface min-w-0 rounded-lg border p-5',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-text-secondary flex min-h-40 items-center justify-center text-sm">
      {message}
    </div>
  );
}

export function LoadingState({ message }: { message: string }) {
  return (
    <Panel className="flex min-h-52 flex-col items-center justify-center gap-3">
      <Spinner tone="secondary" className="size-7" />
      <span className="text-text-secondary text-sm">{message}</span>
    </Panel>
  );
}

export function KpiCard({
  title,
  value,
  detail,
  locale,
}: {
  title: string;
  value: number;
  detail?: string;
  locale: string;
}) {
  return (
    <Panel className="flex min-w-0 flex-col justify-between gap-3">
      <h2 className="text-text-secondary text-sm font-medium">{title}</h2>
      <div className="text-text-primary text-3xl leading-none font-semibold tabular-nums">
        {formatNumber(value, locale)}
      </div>
      {detail != null && <p className="text-text-secondary text-xs">{detail}</p>}
    </Panel>
  );
}

export function TablePanel({
  title,
  children,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Panel className="overflow-hidden">
      <h2 className="text-text-primary mb-3 text-base font-semibold">{title}</h2>
      {children}
    </Panel>
  );
}

export function Pagination({
  page,
  pages,
  isFetching,
  onPageChange,
  localize,
}: {
  page: number;
  pages: number;
  isFetching: boolean;
  onPageChange: (page: number) => void;
  localize: Localize;
}) {
  if (pages <= 1) {
    return null;
  }
  return (
    <div className="border-border-light flex items-center justify-between gap-3 border-t px-3 py-3 text-sm">
      <span className="text-text-secondary">
        {localize('com_superadmin_page_of', { page, pages })}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page <= 1 || isFetching}
          onClick={() => onPageChange(page - 1)}
        >
          {localize('com_superadmin_previous')}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= pages || isFetching}
          onClick={() => onPageChange(page + 1)}
        >
          {localize('com_superadmin_next')}
        </Button>
      </div>
    </div>
  );
}

export function DailyUsageTable({
  rows,
  localize,
  locale,
}: {
  rows: TSuperAdminDailyPoint[];
  localize: Localize;
  locale: string;
}) {
  return (
    <TablePanel title={localize('com_superadmin_daily_usage')}>
      {rows.length === 0 ? (
        <EmptyState message={localize('com_superadmin_no_data')} />
      ) : (
        <div className="max-h-[24rem] overflow-auto">
          <table className="w-full min-w-[34rem] text-start text-sm">
            <thead className="border-border-medium text-text-secondary bg-chart-widget-surface sticky top-0 border-b text-xs">
              <tr>
                <th className="px-2 py-2 font-medium">{localize('com_superadmin_date')}</th>
                <th className="px-2 py-2 text-end font-medium">
                  {localize('com_superadmin_conversations')}
                </th>
                <th className="px-2 py-2 text-end font-medium">
                  {localize('com_superadmin_messages')}
                </th>
                <th className="px-2 py-2 text-end font-medium">
                  {localize('com_superadmin_input_tokens')}
                </th>
                <th className="px-2 py-2 text-end font-medium">
                  {localize('com_superadmin_output_tokens')}
                </th>
                <th className="px-2 py-2 text-end font-medium">
                  {localize('com_superadmin_total_tokens')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-border-light divide-y">
              {rows.map((row) => (
                <tr key={row.date} className="hover:bg-surface-hover">
                  <td className="text-text-primary px-2 py-2 whitespace-nowrap">{row.date}</td>
                  <td className="px-2 py-2 text-end tabular-nums">
                    {formatNumber(row.conversations, locale)}
                  </td>
                  <td className="px-2 py-2 text-end tabular-nums">
                    {formatNumber(row.messages, locale)}
                  </td>
                  <td className="px-2 py-2 text-end tabular-nums">
                    {formatNumber(row.promptTokens, locale)}
                  </td>
                  <td className="px-2 py-2 text-end tabular-nums">
                    {formatNumber(row.completionTokens, locale)}
                  </td>
                  <td className="text-text-primary px-2 py-2 text-end font-medium tabular-nums">
                    {formatNumber(row.totalTokens, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TablePanel>
  );
}

export function ModelUsageTable({
  rows,
  localize,
  locale,
}: {
  rows: TSuperAdminModelUsage[];
  localize: Localize;
  locale: string;
}) {
  return (
    <TablePanel title={localize('com_superadmin_usage_by_model')}>
      {rows.length === 0 ? (
        <EmptyState message={localize('com_superadmin_no_data')} />
      ) : (
        <div className="max-h-[24rem] overflow-auto">
          <table className="w-full min-w-[30rem] text-start text-sm">
            <thead className="border-border-medium text-text-secondary bg-chart-widget-surface sticky top-0 border-b text-xs">
              <tr>
                <th className="px-2 py-2 font-medium">{localize('com_superadmin_model')}</th>
                <th className="px-2 py-2 text-end font-medium">
                  {localize('com_superadmin_messages')}
                </th>
                <th className="px-2 py-2 text-end font-medium">
                  {localize('com_superadmin_input_tokens')}
                </th>
                <th className="px-2 py-2 text-end font-medium">
                  {localize('com_superadmin_output_tokens')}
                </th>
                <th className="px-2 py-2 text-end font-medium">
                  {localize('com_superadmin_total_tokens')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-border-light divide-y">
              {rows.map((row) => (
                <tr key={row.model || 'unknown'} className="hover:bg-surface-hover">
                  <td className="text-text-primary max-w-[16rem] truncate px-2 py-2">
                    {row.model || localize('com_superadmin_unknown_model')}
                  </td>
                  <td className="px-2 py-2 text-end tabular-nums">
                    {formatNumber(row.messages, locale)}
                  </td>
                  <td className="px-2 py-2 text-end tabular-nums">
                    {formatNumber(row.promptTokens, locale)}
                  </td>
                  <td className="px-2 py-2 text-end tabular-nums">
                    {formatNumber(row.completionTokens, locale)}
                  </td>
                  <td className="text-text-primary px-2 py-2 text-end font-medium tabular-nums">
                    {formatNumber(row.totalTokens, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </TablePanel>
  );
}

export function UserCell({
  user,
  localize,
}: {
  user: Pick<TSuperAdminUser, 'name' | 'username' | 'email'>;
  localize: Localize;
}) {
  const displayName = user.name || user.username || localize('com_superadmin_unknown_user');
  return (
    <div className="min-w-0">
      <div className="text-text-primary truncate">{displayName}</div>
      <div className="text-text-secondary truncate text-xs">{user.email}</div>
    </div>
  );
}

export function UsersTable({
  users,
  page,
  pages,
  isFetching,
  onPageChange,
  onSelectUser,
  localize,
  locale,
}: {
  users: TSuperAdminUser[];
  page: number;
  pages: number;
  isFetching: boolean;
  onPageChange: (page: number) => void;
  onSelectUser: (user: TSuperAdminUser) => void;
  localize: Localize;
  locale: string;
}) {
  return (
    <TablePanel title={localize('com_superadmin_users')}>
      {users.length === 0 ? (
        <EmptyState message={localize('com_superadmin_no_users')} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[62rem] text-start text-sm">
              <thead className="border-border-medium text-text-secondary border-b text-xs">
                <tr>
                  <th className="px-2 py-2 font-medium">{localize('com_superadmin_user')}</th>
                  <th className="px-2 py-2 font-medium">{localize('com_superadmin_role')}</th>
                  <th className="px-2 py-2 text-end font-medium">
                    {localize('com_superadmin_conversations')}
                  </th>
                  <th className="px-2 py-2 text-end font-medium">
                    {localize('com_superadmin_messages')}
                  </th>
                  <th className="px-2 py-2 text-end font-medium">
                    {localize('com_superadmin_input_tokens')}
                  </th>
                  <th className="px-2 py-2 text-end font-medium">
                    {localize('com_superadmin_output_tokens')}
                  </th>
                  <th className="px-2 py-2 text-end font-medium">
                    {localize('com_superadmin_total_tokens')}
                  </th>
                  <th className="px-2 py-2 text-end font-medium">
                    {localize('com_superadmin_last_active')}
                  </th>
                  <th className="px-2 py-2 text-end font-medium">
                    <span className="sr-only">{localize('com_superadmin_chat_history')}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border-light divide-y">
                {users.map((user) => (
                  <tr key={user.userId} className="hover:bg-surface-hover">
                    <td className="max-w-[18rem] px-2 py-3">
                      <UserCell user={user} localize={localize} />
                    </td>
                    <td className="text-text-secondary px-2 py-3">{user.role}</td>
                    <td className="px-2 py-3 text-end tabular-nums">
                      {formatNumber(user.conversations, locale)}
                    </td>
                    <td className="px-2 py-3 text-end tabular-nums">
                      {formatNumber(user.messages, locale)}
                    </td>
                    <td className="px-2 py-3 text-end tabular-nums">
                      {formatNumber(user.promptTokens, locale)}
                    </td>
                    <td className="px-2 py-3 text-end tabular-nums">
                      {formatNumber(user.completionTokens, locale)}
                    </td>
                    <td className="text-text-primary px-2 py-3 text-end font-medium tabular-nums">
                      {formatNumber(user.totalTokens, locale)}
                    </td>
                    <td className="text-text-secondary px-2 py-3 text-end whitespace-nowrap">
                      {formatDateTime(user.lastActiveAt, locale) ||
                        formatDate(user.createdAt, locale)}
                    </td>
                    <td className="px-2 py-3 text-end">
                      <button
                        type="button"
                        onClick={() => onSelectUser(user)}
                        className="border-border-medium hover:bg-surface-hover rounded-md border px-3 py-1.5 text-xs whitespace-nowrap"
                      >
                        {localize('com_superadmin_view_chats')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination
            page={page}
            pages={pages}
            isFetching={isFetching}
            onPageChange={onPageChange}
            localize={localize}
          />
        </>
      )}
    </TablePanel>
  );
}
