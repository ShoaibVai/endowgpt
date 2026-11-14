import React from 'react';
import { getDefaultStore } from 'jotai';
import '@testing-library/jest-dom';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@testing-library/react';
import type { TDocumentStorageUsage } from 'librechat-data-provider';
import { showFilesDialogAtom, filesDialogTriggerAtom } from '~/store/filesDialog';
import StorageIndicator from '../StorageIndicator';
import StorageUsage from '../StorageUsage';

type StorageResult = {
  data?: TDocumentStorageUsage;
  isLoading: boolean;
  isError: boolean;
};

const mockStorageResult: { current: StorageResult } = {
  current: {
    data: {
      usedBytes: 25 * 1024 * 1024,
      limitBytes: 100 * 1024 * 1024,
      documentBytes: 5 * 1024 * 1024,
      generatedFileBytes: 20 * 1024 * 1024,
    },
    isLoading: false,
    isError: false,
  },
};

jest.mock('~/data-provider', () => ({
  useGetDocumentStorageQuery: () => mockStorageResult.current,
}));

jest.mock('~/components/Chat/Input/Files/MyFilesModal', () => ({
  MyFilesModal: ({ open }: { open: boolean }) =>
    open ? <div data-testid="my-files-modal" /> : null,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, string | number>) =>
    values == null ? key : `${key}:${Object.values(values).join(',')}`,
}));

function renderUsage() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<StorageUsage />} />
        <Route path="/documents" element={<div>documents-page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockStorageResult.current = {
    data: {
      usedBytes: 25 * 1024 * 1024,
      limitBytes: 100 * 1024 * 1024,
      documentBytes: 5 * 1024 * 1024,
      generatedFileBytes: 20 * 1024 * 1024,
    },
    isLoading: false,
    isError: false,
  };
  const store = getDefaultStore();
  store.set(showFilesDialogAtom, false);
  store.set(filesDialogTriggerAtom, null);
});

describe('StorageUsage', () => {
  test('shows usage, a progress bar, and the document/file breakdown', () => {
    renderUsage();

    expect(screen.getByTestId('storage-usage')).toBeInTheDocument();
    expect(screen.getByText('com_ui_storage_usage:25.0 MB,100.0 MB')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', {
        name: 'com_ui_storage_usage_label:25.0 MB,100.0 MB',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/com_ui_storage_documents: 5\.0 MB/)).toBeInTheDocument();
    expect(screen.getByText(/com_ui_storage_generated_files: 20\.0 MB/)).toBeInTheDocument();
  });

  test('opens the file manager and links to the documents page', async () => {
    const user = userEvent.setup();
    renderUsage();

    expect(screen.queryByTestId('my-files-modal')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'com_ui_storage_manage_files' }));
    expect(screen.getByTestId('my-files-modal')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'com_ui_storage_manage_documents' }));
    await waitFor(() => expect(screen.getByText('documents-page')).toBeInTheDocument());
  });

  test('shows a full warning at the cap', () => {
    mockStorageResult.current = {
      data: {
        usedBytes: 100 * 1024 * 1024,
        limitBytes: 100 * 1024 * 1024,
        documentBytes: 5 * 1024 * 1024,
        generatedFileBytes: 95 * 1024 * 1024,
      },
      isLoading: false,
      isError: false,
    };
    renderUsage();

    expect(screen.getByRole('alert')).toHaveTextContent('com_ui_storage_full');
  });

  test('shows the unavailable state when accounting fails', () => {
    mockStorageResult.current = { isLoading: false, isError: true };
    renderUsage();

    expect(screen.getByText('com_ui_storage_unavailable')).toBeInTheDocument();
  });

  test('reserves the meter while usage loads', () => {
    mockStorageResult.current = { isLoading: true, isError: false };
    renderUsage();

    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('com_ui_storage_unavailable')).not.toBeInTheDocument();
  });
});

describe('StorageIndicator', () => {
  test('shows usage in its accessible name and opens the file manager', async () => {
    const user = userEvent.setup();
    render(<StorageIndicator />);

    const button = screen.getByRole('button', {
      name: 'com_ui_storage_usage_label:25.0 MB,100.0 MB',
    });
    expect(screen.getByTestId('storage-indicator')).toBe(button);

    await user.click(button);
    expect(getDefaultStore().get(showFilesDialogAtom)).toBe(true);
  });
});
