import React from 'react';
import { render, waitFor } from '@testing-library/react';
import DocxViewer from '../DocxViewer';
import useFileBlob from '../useFileBlob';

const mockRenderAsync = jest.fn().mockResolvedValue(undefined);

jest.mock('docx-preview', () => ({
  renderAsync: (...args: unknown[]) => mockRenderAsync(...args),
}));

jest.mock('../useFileBlob', () => ({
  __esModule: true,
  default: jest.fn(),
}));

const mockUseFileBlob = useFileBlob as jest.MockedFunction<typeof useFileBlob>;

describe('DocxViewer', () => {
  it('hands the blob to docx-preview', async () => {
    const blob = new Blob(['docx'], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    mockUseFileBlob.mockReturnValue({
      data: blob,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as unknown as ReturnType<typeof useFileBlob>);

    render(<DocxViewer userId="user-1" fileId="file-1" />);

    await waitFor(() => expect(mockRenderAsync).toHaveBeenCalledTimes(1));
    expect(mockRenderAsync).toHaveBeenCalledWith(
      blob,
      expect.any(HTMLDivElement),
      undefined,
      expect.objectContaining({ breakPages: true, inWrapper: true }),
    );
  });
});
