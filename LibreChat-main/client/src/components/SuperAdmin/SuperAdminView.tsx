import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';
import { Button, Input, Spinner } from '@librechat/client';
import type { TSuperAdminRange, TSuperAdminUser } from 'librechat-data-provider';
import type { TranslationKeys } from '~/hooks';
import {
  useSuperAdminAccessQuery,
  useSuperAdminOverviewQuery,
  useSuperAdminUsersQuery,
} from '~/data-provider';
import { useAuthContext, useDocumentTitle, useLocalize } from '~/hooks';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import useDrawerViewport from '~/hooks/Nav/useDrawerViewport';
import ChatHistory from './ChatHistory';
import Documents from './Documents';
import Audit from './Audit';
import {
  DailyUsageTable,
  KpiCard,
  LoadingState,
  ModelUsageTable,
  Panel,
  UsersTable,
} from './panels';
import { formatNumber } from './format';

const USERS_PAGE_SIZE = 25;
const SEARCH_DELAY_MS = 350;

type PortalTab = 'overview' | 'users' | 'documents' | 'audit';

const ranges: Array<{ value: TSuperAdminRange; labelKey: TranslationKeys }> = [
  { value: '24h', labelKey: 'com_superadmin_range_24_hours' },
  { value: '7d', labelKey: 'com_superadmin_range_7_days' },
  { value: '30d', labelKey: 'com_superadmin_range_30_days' },
  { value: 'all', labelKey: 'com_superadmin_range_all' },
];

const tabs: Array<{ value: PortalTab; labelKey: TranslationKeys }> = [
  { value: 'overview', labelKey: 'com_superadmin_tab_overview' },
  { value: 'users', labelKey: 'com_superadmin_tab_users' },
  { value: 'documents', labelKey: 'com_superadmin_tab_documents' },
  { value: 'audit', labelKey: 'com_superadmin_tab_audit' },
];

export default function SuperAdminView() {
  const localize = useLocalize();
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language ?? 'en';
  const { user } = useAuthContext();
  const isSmallScreen = useDrawerViewport();

  const [activeTab, setActiveTab] = useState<PortalTab>('overview');
  const [range, setRange] = useState<TSuperAdminRange>('30d');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [historyUser, setHistoryUser] = useState<TSuperAdminUser | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const accessQuery = useSuperAdminAccessQuery(user?.id, { enabled: !!user });
  const accessGranted = accessQuery.data?.access === true;
  const enabled = !!user && accessGranted;

  const overviewQuery = useSuperAdminOverviewQuery(
    { range },
    { enabled: enabled && activeTab === 'overview' },
  );
  const usersQuery = useSuperAdminUsersQuery(
    { range, page, pageSize: USERS_PAGE_SIZE, search },
    { enabled: enabled && activeTab === 'users' },
  );

  useDocumentTitle(`${localize('com_superadmin_title')} | endowGPT`);

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

  const totals = overviewQuery.data?.totals;
  const kpiCards = useMemo(
    () => [
      {
        id: 'users',
        title: localize('com_superadmin_total_users'),
        value: totals?.users ?? 0,
      },
      {
        id: 'activeUsers',
        title: localize('com_superadmin_active_users'),
        value: totals?.activeUsers ?? 0,
      },
      {
        id: 'conversations',
        title: localize('com_superadmin_total_conversations'),
        value: totals?.conversations ?? 0,
      },
      {
        id: 'messages',
        title: localize('com_superadmin_total_messages'),
        value: totals?.messages ?? 0,
      },
      {
        id: 'tokens',
        title: localize('com_superadmin_total_tokens'),
        value: totals?.totalTokens ?? 0,
        detail:
          totals == null
            ? undefined
            : localize('com_superadmin_token_split', {
                input: formatNumber(totals.promptTokens, locale),
                output: formatNumber(totals.completionTokens, locale),
              }),
      },
    ],
    [locale, localize, totals],
  );

  if (accessQuery.isLoading) {
    return (
      <div className="bg-surface-primary-alt h-full w-full p-4">
        <LoadingState message={localize('com_superadmin_loading')} />
      </div>
    );
  }

  if (!accessGranted) {
    return (
      <div className="bg-surface-primary-alt text-text-primary flex h-full w-full flex-col">
        <header className="flex min-h-14 items-center gap-3 px-4 py-3 sm:px-5 md:px-6 lg:px-8">
          {isSmallScreen && <OpenSidebar />}
          <h1 className="text-base font-semibold">{localize('com_superadmin_title')}</h1>
        </header>
        <main className="flex flex-1 items-center justify-center p-4">
          <Panel className="flex max-w-md items-center gap-2">
            <AlertCircle className="text-status-error size-4 shrink-0" aria-hidden="true" />
            <span className="text-sm">{localize('com_superadmin_forbidden')}</span>
          </Panel>
        </main>
      </div>
    );
  }

  const tokenSourceNote =
    totals?.tokenSource === 'transactions'
      ? localize('com_superadmin_token_source_transactions')
      : localize('com_superadmin_token_source_messages');
  const showRange = activeTab === 'overview' || activeTab === 'users';

  let usersContent: React.ReactNode;
  if (usersQuery.isLoading && !usersQuery.data) {
    usersContent = <LoadingState message={localize('com_superadmin_loading')} />;
  } else if (usersQuery.isError && !usersQuery.data) {
    usersContent = (
      <Panel className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-sm">
          <AlertCircle className="text-status-error size-4" aria-hidden="true" />
          {localize('com_superadmin_load_error')}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void usersQuery.refetch();
          }}
        >
          {localize('com_superadmin_retry')}
        </Button>
      </Panel>
    );
  } else {
    usersContent = (
      <UsersTable
        users={usersQuery.data?.users ?? []}
        page={usersQuery.data?.page ?? page}
        pages={usersQuery.data?.pages ?? 1}
        isFetching={usersQuery.isFetching}
        onPageChange={setPage}
        onSelectUser={(selected) => {
          setHistoryUser(selected);
          setHistoryOpen(true);
        }}
        localize={localize}
        locale={locale}
      />
    );
  }

  return (
    <div className="bg-surface-primary-alt text-text-primary flex h-full w-full min-w-0 flex-col">
      <header className="bg-surface-primary-alt z-20 flex w-full shrink-0 flex-col gap-3 px-4 py-3 sm:px-5 md:px-6 lg:px-8">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            {isSmallScreen && <OpenSidebar />}
            <div className="min-w-0">
              <h1 className="text-base font-semibold">{localize('com_superadmin_title')}</h1>
              <p className="text-text-secondary truncate text-xs">
                {localize('com_superadmin_subtitle')}
              </p>
            </div>
          </div>
          {showRange && (
            <div className="border-border-light inline-flex shrink-0 rounded-lg border p-0.5">
              {ranges.map((item) => (
                <Button
                  key={item.value}
                  size="sm"
                  variant="outline-toggle"
                  aria-pressed={range === item.value}
                  onClick={() => {
                    setRange(item.value);
                    setPage(1);
                  }}
                >
                  {localize(item.labelKey)}
                </Button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-1" role="tablist">
          {tabs.map((tab) => (
            <Button
              key={tab.value}
              size="sm"
              variant="ghost"
              role="tab"
              aria-selected={activeTab === tab.value}
              onClick={() => setActiveTab(tab.value)}
            >
              {localize(tab.labelKey)}
            </Button>
          ))}
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
        <div className="flex w-full min-w-0 flex-col gap-3 px-4 pt-4 pb-8 sm:px-5 md:px-6 lg:px-8">
          {activeTab === 'overview' && (
            <>
              {overviewQuery.isLoading && !overviewQuery.data ? (
                <LoadingState message={localize('com_superadmin_loading')} />
              ) : null}

              {overviewQuery.isError && !overviewQuery.data ? (
                <Panel className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm">
                    <AlertCircle className="text-status-error size-4" aria-hidden="true" />
                    {localize('com_superadmin_load_error')}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      void overviewQuery.refetch();
                    }}
                  >
                    {localize('com_superadmin_retry')}
                  </Button>
                </Panel>
              ) : null}

              {overviewQuery.data && (
                <>
                  <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                    {kpiCards.map((card) => (
                      <KpiCard
                        key={card.id}
                        title={card.title}
                        value={card.value}
                        detail={card.detail}
                        locale={locale}
                      />
                    ))}
                  </div>
                  <p className="text-text-secondary text-xs">{tokenSourceNote}</p>
                  <div className="grid w-full grid-cols-[repeat(auto-fit,minmax(min(100%,34rem),1fr))] gap-3">
                    <DailyUsageTable
                      rows={overviewQuery.data.daily}
                      localize={localize}
                      locale={locale}
                    />
                    <ModelUsageTable
                      rows={overviewQuery.data.models}
                      localize={localize}
                      locale={locale}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === 'users' && (
            <>
              <Panel className="flex flex-col gap-3 p-4">
                <label
                  className="text-text-secondary block text-xs font-medium"
                  htmlFor="superadmin-user-search"
                >
                  {localize('com_superadmin_search_users')}
                </label>
                <Input
                  id="superadmin-user-search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder={localize('com_superadmin_search_users')}
                  aria-label={localize('com_superadmin_search_users')}
                />
              </Panel>

              {usersContent}

              {usersQuery.isFetching && !usersQuery.isLoading ? (
                <div className="text-text-secondary flex items-center justify-center gap-2 text-xs">
                  <Spinner tone="secondary" className="size-3.5" />
                  {localize('com_superadmin_loading')}
                </div>
              ) : null}
            </>
          )}

          {activeTab === 'documents' && (
            <Documents enabled={enabled} localize={localize} locale={locale} />
          )}

          {activeTab === 'audit' && <Audit enabled={enabled} localize={localize} locale={locale} />}
        </div>
      </main>

      <ChatHistory
        user={historyUser}
        open={historyOpen}
        onOpenChange={(open) => {
          setHistoryOpen(open);
          if (!open) {
            setHistoryUser(null);
          }
        }}
        localize={localize}
        locale={locale}
      />
    </div>
  );
}
