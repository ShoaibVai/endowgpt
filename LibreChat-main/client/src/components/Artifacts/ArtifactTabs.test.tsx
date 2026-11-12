import React from 'react';
import { render, screen } from '@testing-library/react';
import type { Artifact } from '~/common';
import ArtifactTabs from './ArtifactTabs';

jest.mock('./Document', () => ({
  __esModule: true,
  default: () => <div data-testid="document-editor" />,
}));

jest.mock('./FilePreview', () => ({
  __esModule: true,
  default: () => <div data-testid="file-preview" />,
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

const documentArtifact: Artifact = {
  id: 'document-1',
  type: 'application/vnd.endowgpt.document',
  title: 'Plan',
  content: '# Plan',
  lastUpdateTime: 1,
};

const generatedFileArtifact: Artifact = {
  id: 'tool-artifact-file-1',
  type: 'application/vnd.librechat.spreadsheet-preview',
  title: 'data.xlsx',
  content: '',
  lastUpdateTime: 1,
  download: {
    file_id: 'file-1',
    filename: 'data.xlsx',
    generatedFile: { version: 1, tool: 'write_file', kind: 'spreadsheet', format: 'xlsx' },
  },
};

describe('ArtifactTabs', () => {
  it('mounts the document editor for editable documents', async () => {
    render(<ArtifactTabs artifact={documentArtifact} />);

    expect(await screen.findByTestId('document-editor')).toBeInTheDocument();
    expect(screen.queryByTestId('file-preview')).not.toBeInTheDocument();
  });

  it('mounts the file preview for generated files', async () => {
    render(<ArtifactTabs artifact={generatedFileArtifact} />);

    expect(await screen.findByTestId('file-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('document-editor')).not.toBeInTheDocument();
  });

  it('shows a legacy stock artifact as readable text instead of a blank panel', () => {
    render(
      <ArtifactTabs
        artifact={{
          id: 'legacy-1',
          type: 'text/html',
          title: 'dashboard.html',
          content: '<main>Old dashboard</main>',
          lastUpdateTime: 1,
        }}
      />,
    );

    expect(screen.getByText('<main>Old dashboard</main>')).toBeInTheDocument();
    expect(screen.queryByTestId('document-editor')).not.toBeInTheDocument();
    expect(screen.queryByTestId('file-preview')).not.toBeInTheDocument();
  });
});
