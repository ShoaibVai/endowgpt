import React from 'react';
import { render, screen } from '@testing-library/react';
import MarkdownViewer from '../MarkdownViewer';
import useFileBlob from '../useFileBlob';

jest.mock('../useFileBlob', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('~/components/Chat/Messages/Content/MarkdownLite', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => (
    <div data-testid="markdown-content">{content}</div>
  ),
}));

const mockUseFileBlob = useFileBlob as jest.MockedFunction<typeof useFileBlob>;

describe('MarkdownViewer', () => {
  it('renders fetched markdown bytes', async () => {
    mockUseFileBlob.mockReturnValue({
      data: {
        text: async () => '# Student report\n\nHello',
      } as Blob,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useFileBlob>);

    render(<MarkdownViewer userId="user-1" fileId="file-1" />);

    expect(await screen.findByText(/# Student report/)).toBeInTheDocument();
  });

  it('shows the retry state on fetch failure', () => {
    mockUseFileBlob.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useFileBlob>);

    render(<MarkdownViewer userId="user-1" fileId="file-1" />);
    expect(screen.getByText('Preview unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
