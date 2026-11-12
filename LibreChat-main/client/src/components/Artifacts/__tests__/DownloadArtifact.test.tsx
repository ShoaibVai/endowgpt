import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { Artifact } from '~/common';
import { TOOL_ARTIFACT_TYPES } from '~/utils/artifacts';
import DownloadArtifact from '../DownloadArtifact';

const mockFileDownload = jest.fn();
const mockAttachmentOptions = jest.fn();
const mockShowToast = jest.fn();

jest.mock('~/hooks/useLocalize', () => ({
  __esModule: true,
  default: () => (key: string) => key,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

/* MorphIcon renders a single morphing <svg> with no per-icon class, so map
 * the lucide icon data it was handed back to a stable name instead. */
jest.mock('@librechat/client', () => {
  const { createMorphIconMock } = jest.requireActual('~/../test/mockMorphIcon');
  const { Download, CircleCheckBig } = jest.requireActual('lucide');
  return {
    ...jest.requireActual('@librechat/client'),
    useToastContext: () => ({ showToast: mockShowToast }),
    MorphIcon: createMorphIconMock([
      [Download, 'download'],
      [CircleCheckBig, 'circle-check-big'],
    ]),
  };
});

jest.mock('~/components/Chat/Messages/Content/Parts/LogLink', () => ({
  useAttachmentLink: (options: { filename: string }) => {
    mockAttachmentOptions(options);
    return { handleDownload: mockFileDownload };
  },
  isLocallyStoredSource: (source?: string) =>
    ['local', 'firebase', 's3', 'cloudfront', 'azure_blob'].includes(source ?? ''),
}));

const generatedSpreadsheet: Artifact = {
  id: 'tool-artifact-fid-1',
  lastUpdateTime: 0,
  type: TOOL_ARTIFACT_TYPES.SPREADSHEET,
  title: 'book.xlsx',
  content: 'cached preview',
  download: {
    filepath: '/api/files/code/output/book.xlsx',
    file_id: 'fid-1',
    filename: 'book.xlsx',
    source: 'execute_code',
    user: 'user-1',
    generatedFile: { version: 1, tool: 'write_file', kind: 'spreadsheet', format: 'xlsx' },
  },
};

const documentArtifact: Artifact = {
  id: 'document-1',
  lastUpdateTime: 0,
  type: TOOL_ARTIFACT_TYPES.DOCUMENT,
  title: 'Migration Plan',
  content: '# Migration Plan\n\nBody',
};

const sharedWithoutRoute: Artifact = {
  id: 'tool-artifact-fid-2',
  lastUpdateTime: 0,
  type: TOOL_ARTIFACT_TYPES.SPREADSHEET,
  title: 'book.xlsx',
  content: 'cached preview',
  download: {
    file_id: 'fid-2',
    generatedFile: { version: 1, tool: 'write_file', kind: 'spreadsheet', format: 'xlsx' },
  },
};

describe('DownloadArtifact', () => {
  let createObjectURL: jest.Mock;
  let revokeObjectURL: jest.Mock;
  let anchorClick: jest.SpyInstance;

  beforeEach(() => {
    mockFileDownload.mockReset();
    mockFileDownload.mockResolvedValue(true);
    mockAttachmentOptions.mockReset();
    mockShowToast.mockReset();
    createObjectURL = jest.fn(() => 'blob:mock');
    revokeObjectURL = jest.fn();
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    anchorClick = jest
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    anchorClick.mockRestore();
  });

  it('downloads the original binary for a generated file', async () => {
    const { container } = render(<DownloadArtifact artifact={generatedSpreadsheet} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    expect(mockFileDownload).toHaveBeenCalledTimes(1);
    expect(mockAttachmentOptions).toHaveBeenLastCalledWith(
      expect.objectContaining({ filename: 'book.xlsx' }),
    );
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(container.querySelector('[data-icon="circle-check-big"]')).not.toBeNull();
  });

  it('does not offer cached preview bytes for a generated file without a route', async () => {
    const { container } = render(<DownloadArtifact artifact={sharedWithoutRoute} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    expect(mockFileDownload).not.toHaveBeenCalled();
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'error',
      message: 'com_ui_download_error',
    });
    expect(container.querySelector('[data-icon="circle-check-big"]')).toBeNull();
  });

  it('exports a document as a markdown blob named from its title', async () => {
    render(<DownloadArtifact artifact={documentArtifact} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    expect(mockFileDownload).not.toHaveBeenCalled();
    expect(anchorClick.mock.instances[0].download).toBe('Migration Plan.md');
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    const content = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(blob);
    });
    expect(content).toBe('# Migration Plan\n\nBody');
  });

  it('reports a failed blob export and keeps the download icon', async () => {
    createObjectURL.mockImplementation(() => {
      throw new Error('no object url');
    });
    const { container } = render(<DownloadArtifact artifact={documentArtifact} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'error',
      message: 'com_ui_download_error',
    });
    expect(container.querySelector('[data-icon="circle-check-big"]')).toBeNull();
  });

  it('can retry after the original download fails', async () => {
    mockFileDownload.mockResolvedValueOnce(false);
    const { container } = render(<DownloadArtifact artifact={generatedSpreadsheet} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(container.querySelector('[data-icon="circle-check-big"]')).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(mockFileDownload).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[data-icon="circle-check-big"]')).not.toBeNull();
  });

  it('refuses an empty document without inventing bytes', async () => {
    render(
      <DownloadArtifact
        artifact={{ ...documentArtifact, content: undefined, title: 'Untitled' }}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    expect(createObjectURL).not.toHaveBeenCalled();
    expect(mockShowToast).toHaveBeenCalledWith({
      status: 'error',
      message: 'com_ui_download_error',
    });
  });
});
