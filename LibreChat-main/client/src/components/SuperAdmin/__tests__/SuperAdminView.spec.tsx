import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SuperAdminView from '../SuperAdminView';

const mockOverview = {
  totals: {
    users: 2,
    activeUsers: 1,
    conversations: 3,
    messages: 4,
    promptTokens: 100,
    completionTokens: 50,
    totalTokens: 150,
    tokenSource: 'transactions' as const,
  },
  daily: [
    {
      date: '2026-01-01',
      conversations: 3,
      messages: 4,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    },
  ],
  models: [
    {
      model: 'model-a',
      messages: 4,
      promptTokens: 100,
      completionTokens: 50,
      totalTokens: 150,
    },
  ],
};

const mockUsers = {
  users: [
    {
      userId: 'user-a',
      name: 'Alice',
      username: 'alice',
      email: 'alice@example.com',
      role: 'USER',
      createdAt: '2026-01-01T00:00:00.000Z',
      lastActiveAt: '2026-01-02T00:00:00.000Z',
      conversations: 2,
      messages: 3,
      promptTokens: 80,
      completionTokens: 40,
      totalTokens: 120,
    },
  ],
  page: 1,
  pageSize: 25,
  total: 1,
  pages: 1,
};

const mockConversations = {
  conversations: [
    {
      conversationId: 'convo-1',
      title: 'Project draft',
      model: 'model-a',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-02T00:00:00.000Z',
      messages: 2,
      totalTokens: 20,
      archived: false,
    },
  ],
  page: 1,
  pageSize: 20,
  total: 1,
  pages: 1,
};

const mockMessages = {
  conversationId: 'convo-1',
  messages: [
    {
      messageId: 'message-1',
      isCreatedByUser: true,
      sender: 'User',
      model: 'model-a',
      text: 'Hello from the transcript',
      truncated: false,
      tokenCount: 4,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  page: 1,
  pageSize: 25,
  total: 1,
  pages: 1,
};

let mockAccessState: Record<string, unknown> = {
  data: { access: true },
  isLoading: false,
  isError: false,
};

jest.mock('~/data-provider', () => ({
  useSuperAdminAccessQuery: () => mockAccessState,
  useSuperAdminOverviewQuery: () => ({
    data: mockOverview,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useSuperAdminUsersQuery: () => ({
    data: mockUsers,
    isLoading: false,
    isFetching: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useSuperAdminConversationsQuery: () => ({
    data: mockConversations,
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
  useSuperAdminMessagesQuery: () => ({
    data: mockMessages,
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
  useSuperAdminDocumentsQuery: () => ({
    data: {
      documents: [
        {
          userId: 'user-a',
          userName: 'Alice',
          userEmail: 'alice@example.com',
          conversationId: 'convo-1',
          artifactId: 'artifact-1',
          title: 'Project note',
          versionCount: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 25,
      total: 1,
      pages: 1,
    },
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
  useSuperAdminDocumentQuery: () => ({
    data: undefined,
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
  useSuperAdminAuditQuery: () => ({
    data: {
      entries: [
        {
          id: 'audit-1',
          category: 'auth',
          action: 'auth.login',
          outcome: 'success',
          severity: 'info',
          actor: { type: 'user', id: 'user-a', name: 'Alice' },
          target: { type: 'session', name: 'Web session' },
          timestamp: '2026-01-02T00:00:00.000Z',
        },
      ],
      total: 1,
      nextCursor: null,
    },
    isLoading: false,
    isFetching: false,
    isError: false,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAuthContext: () => ({ user: { id: 'admin', role: 'ADMIN' } }),
  useDocumentTitle: () => undefined,
}));

jest.mock('~/hooks/Nav/useDrawerViewport', () => ({
  __esModule: true,
  default: () => false,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en', resolvedLanguage: 'en' } }),
}));

jest.mock('~/components/Chat/Menus/OpenSidebar', () => ({
  __esModule: true,
  default: () => null,
}));

function renderView() {
  return render(
    <MemoryRouter initialEntries={['/superadmin']}>
      <SuperAdminView />
    </MemoryRouter>,
  );
}

describe('SuperAdminView', () => {
  beforeEach(() => {
    mockAccessState = { data: { access: true }, isLoading: false, isError: false };
  });

  it('shows the forbidden state without admin access', () => {
    mockAccessState = { data: undefined, isLoading: false, isError: true };
    renderView();
    expect(screen.getByText('com_superadmin_forbidden')).toBeInTheDocument();
  });

  it('renders usage totals and the user table', async () => {
    const user = userEvent.setup();
    renderView();
    expect(screen.getByText('com_superadmin_title')).toBeInTheDocument();
    expect(screen.getByText('com_superadmin_usage_by_model')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'com_superadmin_tab_users' }));
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders documents and the audit log tabs', async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole('tab', { name: 'com_superadmin_tab_documents' }));
    expect(screen.getByText('Project note')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'com_superadmin_tab_audit' }));
    expect(screen.getByText('auth.login')).toBeInTheDocument();
  });

  it('opens a user conversation and reads its transcript', async () => {
    const user = userEvent.setup();
    renderView();

    await user.click(screen.getByRole('tab', { name: 'com_superadmin_tab_users' }));
    await user.click(screen.getByText('com_superadmin_view_chats'));
    expect(await screen.findByText('Project draft')).toBeInTheDocument();

    await user.click(screen.getByText('Project draft'));
    expect(await screen.findByText('Hello from the transcript')).toBeInTheDocument();
  });
});
