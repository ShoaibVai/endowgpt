import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import PptxViewer from '../PptxViewer';
import { useGetStartupConfig } from '~/data-provider';

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: jest.fn(),
}));

const mockUseGetStartupConfig = useGetStartupConfig as jest.MockedFunction<
  typeof useGetStartupConfig
>;

describe('PptxViewer', () => {
  it('shows a clean unavailable state when the flag is off', () => {
    mockUseGetStartupConfig.mockReturnValue({
      data: { filePreview: { pptxEnabled: false } },
    } as unknown as ReturnType<typeof useGetStartupConfig>);

    render(
      <QueryClientProvider client={new QueryClient()}>
        <PptxViewer fileId="file-1" />
      </QueryClientProvider>,
    );

    expect(screen.getByText('Preview not available for this file type')).toBeInTheDocument();
    expect(
      screen.getByText('Download the file to open it in its native application.'),
    ).toBeInTheDocument();
  });
});
