import React from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { render, screen } from '@testing-library/react';
import type { Artifact } from '~/common';
import GeneratedFileTabs from '../GeneratedFileTabs';

const artifact: Artifact = {
  id: 'tool-artifact-file-1',
  title: 'Students.xlsx',
  type: 'application/vnd.librechat.spreadsheet-preview',
  content: '',
  lastUpdateTime: 0,
  download: {
    filename: 'Students.xlsx',
    file_id: 'file-1',
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
};

describe('GeneratedFileTabs', () => {
  it('renders the file identity and download hint', () => {
    render(
      <Tabs.Root defaultValue="preview">
        <GeneratedFileTabs artifact={artifact} />
      </Tabs.Root>,
    );

    expect(screen.getByText('Students.xlsx')).toBeInTheDocument();
    expect(screen.getByText('XLSX · Spreadsheet')).toBeInTheDocument();
    expect(
      screen.getByText('Download the file to open it in its native application.'),
    ).toBeInTheDocument();
  });
});
