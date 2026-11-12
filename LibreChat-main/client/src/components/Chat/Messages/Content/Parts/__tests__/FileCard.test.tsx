import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import type { Artifact } from '~/common';
import FileCard from '../FileCard';

function makeArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'tool-artifact-file-1',
    title: 'Students.xlsx',
    type: 'application/vnd.librechat.spreadsheet-preview',
    content: '',
    lastUpdateTime: 0,
    download: {
      filename: 'Students.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      file_id: 'file-1',
      filepath: '/uploads/user/file-1__Students.xlsx',
      source: 'local',
      user: 'user-1',
      bytes: 2048,
      generatedFile: {
        version: 1,
        tool: 'create_spreadsheet',
        kind: 'spreadsheet',
        format: 'xlsx',
        sheets: 2,
        rows: 50,
      },
    },
    ...overrides,
  };
}

describe('FileCard', () => {
  it('renders the filename, format, and workbook counts', () => {
    render(
      <FileCard
        artifact={makeArtifact()}
        isSelected={false}
        onOpen={jest.fn()}
        onDownload={jest.fn()}
      />,
    );

    expect(screen.getByTestId('generated-file-card')).toBeInTheDocument();
    expect(screen.getByText('Students.xlsx')).toBeInTheDocument();
    expect(screen.getByTestId('generated-file-meta')).toHaveTextContent(
      'XLSX · 2 sheets · 50 rows',
    );
  });

  it('opens and downloads through the callbacks', () => {
    const onOpen = jest.fn();
    const onDownload = jest.fn();
    render(
      <FileCard artifact={makeArtifact()} isSelected onOpen={onOpen} onDownload={onDownload} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    fireEvent.click(screen.getByRole('button', { name: 'Download Students.xlsx' }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders slide counts for presentations', () => {
    render(
      <FileCard
        artifact={makeArtifact({
          title: 'Deck.pptx',
          download: {
            filename: 'Deck.pptx',
            file_id: 'file-2',
            bytes: 4096,
            generatedFile: {
              version: 1,
              tool: 'create_presentation',
              kind: 'presentation',
              format: 'pptx',
              slides: 8,
            },
          },
        })}
        isSelected={false}
        onOpen={jest.fn()}
        onDownload={jest.fn()}
      />,
    );

    expect(screen.getByTestId('generated-file-meta')).toHaveTextContent('PPTX · 8 slides');
  });
});
