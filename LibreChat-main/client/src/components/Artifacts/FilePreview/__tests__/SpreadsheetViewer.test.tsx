import React from 'react';
import { render, screen } from '@testing-library/react';
import type { TFilePreview } from 'librechat-data-provider';
import SpreadsheetViewer from '../SpreadsheetViewer';
import useSpreadsheetPreview from '../useSpreadsheetPreview';

jest.mock('../useSpreadsheetPreview', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getVirtualItems: () =>
      Array.from({ length: Math.min(count, 20) }, (_, index) => ({
        index,
        key: index,
        start: index * 32,
        size: 32,
      })),
    getTotalSize: () => count * 32,
  }),
}));

const mockSpreadsheetPreview = useSpreadsheetPreview as jest.MockedFunction<
  typeof useSpreadsheetPreview
>;

const sheet = {
  name: 'Students',
  index: 0,
  columns: [
    { header: 'Name', width: 20 },
    { header: 'Grade', width: 10 },
  ],
  rows: [
    ['Alice', 92],
    ['Bob', 85],
  ],
  totalRows: 2,
  offset: 0,
  limit: 500,
  frozenRows: 1,
  autoFilter: 'A1:B1',
  styles: { A2: { fill: '#DBEAFE', bold: true } },
};

function mockResult(overrides: Partial<TFilePreview> = {}) {
  mockSpreadsheetPreview.mockReturnValue({
    data: {
      pages: [{ file_id: 'file-1', status: 'ready', sheets: [sheet], ...overrides }],
      pageParams: [0],
    },
    error: null,
    isError: false,
    isLoading: false,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: jest.fn(),
    refetch: jest.fn(),
  } as unknown as ReturnType<typeof useSpreadsheetPreview>);
}

describe('SpreadsheetViewer', () => {
  beforeEach(() => {
    mockSpreadsheetPreview.mockReset();
  });

  it('renders column letters, headers, row numbers, and styled cells', () => {
    mockResult();
    render(<SpreadsheetViewer fileId="file-1" />);

    expect(screen.getByTestId('spreadsheet-viewer')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Grade')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('92')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Students/ })).toBeInTheDocument();

    /** The CSS-module classes carry the workbook-driven grid template; without
     *  them every column collapses into one stacked column. */
    const headerRow = screen.getByText('Name').parentElement?.parentElement;
    expect(headerRow).toHaveClass('spreadsheet-grid', 'grid');

    const styledCell = screen.getByText('Alice').parentElement as HTMLElement;
    expect(styledCell).toHaveClass('spreadsheet-cell');
    expect(styledCell.parentElement).toHaveClass('spreadsheet-row');
    expect(styledCell.style.getPropertyValue('--cell-fill')).toBe('#DBEAFE');
    expect(styledCell.style.getPropertyValue('--cell-weight')).toBe('600');
  });

  it('shows the retry state when the preview endpoint fails', () => {
    mockSpreadsheetPreview.mockReturnValue({
      data: undefined,
      error: new Error('network'),
      isError: true,
      isLoading: false,
      isFetchingNextPage: false,
      hasNextPage: false,
      fetchNextPage: jest.fn(),
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useSpreadsheetPreview>);

    render(<SpreadsheetViewer fileId="file-1" />);
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
