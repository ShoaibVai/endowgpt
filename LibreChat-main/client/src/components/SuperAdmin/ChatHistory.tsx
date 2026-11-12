import { useEffect, useState } from 'react';
import { OGDialog, OGDialogContent, OGDialogTitle, Input, Spinner } from '@librechat/client';
import type {
  TSuperAdminConversation,
  TSuperAdminMessage,
  TSuperAdminUser,
} from 'librechat-data-provider';
import { useSuperAdminConversationsQuery, useSuperAdminMessagesQuery } from '~/data-provider';
import type { Localize } from './panels';
import { EmptyState, Pagination, UserCell } from './panels';
import { formatDateTime, formatNumber } from './format';

const CONVERSATION_PAGE_SIZE = 20;
const MESSAGE_PAGE_SIZE = 25;
const SEARCH_DELAY_MS = 350;

export default function ChatHistory({
  user,
  open,
  onOpenChange,
  localize,
  locale,
}: {
  user: TSuperAdminUser | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localize: Localize;
  locale: string;
}) {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [conversationPage, setConversationPage] = useState(1);
  const [selectedConversation, setSelectedConversation] = useState<TSuperAdminConversation | null>(
    null,
  );
  const [messagePage, setMessagePage] = useState(1);

  const userId = user?.userId ?? null;

  useEffect(() => {
    setSearchInput('');
    setSearch('');
    setConversationPage(1);
    setSelectedConversation(null);
    setMessagePage(1);
  }, [userId]);

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed === search) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setSearch(trimmed);
      setConversationPage(1);
    }, SEARCH_DELAY_MS);
    return () => window.clearTimeout(timeout);
  }, [search, searchInput]);

  const conversationsQuery = useSuperAdminConversationsQuery(
    open ? userId : null,
    { page: conversationPage, pageSize: CONVERSATION_PAGE_SIZE, search },
    { enabled: open && !!userId },
  );
  const messagesQuery = useSuperAdminMessagesQuery(
    open ? userId : null,
    selectedConversation?.conversationId ?? null,
    { page: messagePage, pageSize: MESSAGE_PAGE_SIZE },
    { enabled: open && !!userId && !!selectedConversation },
  );

  const conversations = conversationsQuery.data?.conversations ?? [];
  const messages = messagesQuery.data?.messages ?? [];

  let conversationsBody: React.ReactNode;
  if (conversationsQuery.isLoading) {
    conversationsBody = (
      <div className="flex min-h-40 items-center justify-center">
        <Spinner tone="secondary" className="size-6" />
      </div>
    );
  } else if (conversationsQuery.isError) {
    conversationsBody = <EmptyState message={localize('com_superadmin_load_error')} />;
  } else if (conversations.length === 0) {
    conversationsBody = <EmptyState message={localize('com_superadmin_no_conversations')} />;
  } else {
    conversationsBody = (
      <ul className="divide-border-light divide-y">
        {conversations.map((conversation) => (
          <li key={conversation.conversationId}>
            <button
              type="button"
              onClick={() => {
                setSelectedConversation(conversation);
                setMessagePage(1);
              }}
              className="hover:bg-surface-hover flex w-full flex-col gap-1 px-1 py-3 text-start"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="text-text-primary truncate text-sm font-medium">
                  {conversation.title || conversation.conversationId}
                </span>
                {conversation.archived && (
                  <span className="border-border-medium text-text-secondary text-3xs rounded-full border px-2 py-0.5 whitespace-nowrap">
                    {localize('com_superadmin_archived')}
                  </span>
                )}
              </span>
              <span className="text-text-secondary flex flex-wrap gap-x-3 gap-y-1 text-xs">
                <span>{conversation.model || localize('com_superadmin_unknown_model')}</span>
                <span>
                  {localize('com_superadmin_messages')}:{' '}
                  {formatNumber(conversation.messages, locale)}
                </span>
                <span>
                  {localize('com_superadmin_tokens')}:{' '}
                  {formatNumber(conversation.totalTokens, locale)}
                </span>
                <span>{formatDateTime(conversation.updatedAt, locale)}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="flex max-h-[90vh] w-[95vw] max-w-5xl flex-col overflow-hidden p-0">
        <div className="border-border-light flex min-w-0 flex-col gap-1 border-b px-5 py-4">
          <OGDialogTitle className="text-base font-semibold">
            {localize('com_superadmin_chat_history')}
          </OGDialogTitle>
          {user && <UserCell user={user} localize={localize} />}
        </div>

        {selectedConversation ? (
          <ConversationTranscript
            conversation={selectedConversation}
            messages={messages}
            page={messagesQuery.data?.page ?? messagePage}
            pages={messagesQuery.data?.pages ?? 1}
            isFetching={messagesQuery.isFetching}
            isLoading={messagesQuery.isLoading}
            isError={messagesQuery.isError}
            onPageChange={setMessagePage}
            onBack={() => {
              setSelectedConversation(null);
              setMessagePage(1);
            }}
            localize={localize}
            locale={locale}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="px-5 py-3">
              <label className="text-text-secondary mb-1.5 block text-xs font-medium">
                {localize('com_superadmin_search_conversations')}
              </label>
              <Input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder={localize('com_superadmin_search_conversations')}
                aria-label={localize('com_superadmin_search_conversations')}
              />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">{conversationsBody}</div>
            <Pagination
              page={conversationsQuery.data?.page ?? conversationPage}
              pages={conversationsQuery.data?.pages ?? 1}
              isFetching={conversationsQuery.isFetching}
              onPageChange={setConversationPage}
              localize={localize}
            />
          </div>
        )}
      </OGDialogContent>
    </OGDialog>
  );
}

function ConversationTranscript({
  conversation,
  messages,
  page,
  pages,
  isFetching,
  isLoading,
  isError,
  onPageChange,
  onBack,
  localize,
  locale,
}: {
  conversation: TSuperAdminConversation;
  messages: TSuperAdminMessage[];
  page: number;
  pages: number;
  isFetching: boolean;
  isLoading: boolean;
  isError: boolean;
  onPageChange: (page: number) => void;
  onBack: () => void;
  localize: Localize;
  locale: string;
}) {
  let messagesBody: React.ReactNode;
  if (isLoading) {
    messagesBody = (
      <div className="flex min-h-40 items-center justify-center">
        <Spinner tone="secondary" className="size-6" />
      </div>
    );
  } else if (isError) {
    messagesBody = <EmptyState message={localize('com_superadmin_load_error')} />;
  } else if (messages.length === 0) {
    messagesBody = <EmptyState message={localize('com_superadmin_no_messages')} />;
  } else {
    messagesBody = (
      <ol className="space-y-4">
        {messages.map((message) => (
          <li
            key={message.messageId}
            className={
              message.isCreatedByUser
                ? 'bg-surface-hover rounded-lg p-3'
                : 'border-border-light rounded-lg border p-3'
            }
          >
            <div className="text-text-secondary mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="text-text-primary font-medium">
                {message.isCreatedByUser
                  ? localize('com_superadmin_you')
                  : localize('com_superadmin_assistant')}
              </span>
              {message.model && <span>{message.model}</span>}
              <span>
                {localize('com_superadmin_token_count', {
                  tokenCount: formatNumber(message.tokenCount, locale),
                })}
              </span>
              <span>{formatDateTime(message.createdAt, locale)}</span>
            </div>
            <p className="text-text-primary text-sm break-words whitespace-pre-wrap">
              {message.text || localize('com_superadmin_empty_message')}
            </p>
            {message.truncated && (
              <p className="text-text-secondary mt-2 text-xs">
                {localize('com_superadmin_truncated')}
              </p>
            )}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border-light flex items-center gap-3 border-b px-5 py-3">
        <button
          type="button"
          onClick={onBack}
          className="border-border-medium hover:bg-surface-hover rounded-md border px-3 py-1.5 text-xs whitespace-nowrap"
        >
          {localize('com_superadmin_back_to_chats')}
        </button>
        <div className="min-w-0">
          <div className="text-text-primary truncate text-sm font-medium">
            {conversation.title || conversation.conversationId}
          </div>
          <div className="text-text-secondary text-xs">
            {conversation.model || localize('com_superadmin_unknown_model')} ·{' '}
            {formatDateTime(conversation.updatedAt, locale)}
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{messagesBody}</div>
      <Pagination
        page={page}
        pages={pages}
        isFetching={isFetching}
        onPageChange={onPageChange}
        localize={localize}
      />
    </div>
  );
}
