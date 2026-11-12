import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Mermaid, { MermaidRenderer } from './Mermaid';

const mockExpandLabel = 'com_ui_expand';
const mockProcessedSvg = '<svg viewBox="0 0 400 200" />';
let mockSvgProcessingState = {
  blobUrl: 'blob:mermaid-diagram',
  processedSvg: mockProcessedSvg,
  svgDimensions: { width: 400, height: 200 },
  isLoading: false,
  error: null,
  lastValidSvgRef: { current: null as string | null },
  initialScale: 1,
  calculatedHeight: 240,
};

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string): string =>
      key,
}));

jest.mock('./useSvgProcessing', () => ({
  __esModule: true,
  default: () => mockSvgProcessingState,
}));

jest.mock('./useMermaidZoom', () => ({
  __esModule: true,
  default: () => ({
    zoom: 1,
    pan: { x: 0, y: 0 },
    isPanning: false,
    handleZoomIn: jest.fn(),
    handleZoomOut: jest.fn(),
    handleResetZoom: jest.fn(),
    handleMouseDown: jest.fn(),
  }),
}));

jest.mock('./MermaidHeader', () => ({
  __esModule: true,
  default: ({
    showExpandButton,
    showCode,
    onExpand,
    onToggleCode,
    expandLabel,
    exportSvg,
    exportFilename,
  }: {
    showExpandButton?: boolean;
    showCode: boolean;
    onExpand?: () => void;
    onToggleCode: () => void;
    expandLabel?: string;
    exportSvg?: string | null;
    exportFilename?: string;
  }) => (
    <>
      {showExpandButton && onExpand ? (
        <button type="button" aria-label={expandLabel ?? mockExpandLabel} onClick={onExpand}>
          {expandLabel ?? mockExpandLabel}
        </button>
      ) : null}
      <button
        type="button"
        aria-label={showCode ? 'com_ui_preview' : 'com_ui_show_code'}
        onClick={onToggleCode}
      >
        {showCode ? 'com_ui_preview' : 'com_ui_show_code'}
      </button>
      {exportSvg != null && (
        <output data-testid="mermaid-export">
          {exportFilename}:{exportSvg}
        </output>
      )}
    </>
  ),
}));

jest.mock('./ZoomControls', () => ({
  __esModule: true,
  default: () => <div data-testid="mermaid-zoom-controls" />,
}));

jest.mock('./MermaidDialog', () => ({
  __esModule: true,
  default: ({ open }: { open: boolean }) => (open ? <div data-testid="mermaid-dialog" /> : null),
}));

describe('Mermaid', () => {
  beforeEach(() => {
    mockSvgProcessingState = {
      blobUrl: 'blob:mermaid-diagram',
      processedSvg: mockProcessedSvg,
      svgDimensions: { width: 400, height: 200 },
      isLoading: false,
      error: null,
      lastValidSvgRef: { current: null },
      initialScale: 1,
      calculatedHeight: 240,
    };
  });

  it('renders the diagram and shares its export payload', () => {
    render(<Mermaid id="mermaid-0">{'graph TD\nA-->B'}</Mermaid>);

    expect(screen.getByRole('img', { name: 'com_ui_mermaid_diagram' })).toBeInTheDocument();
    expect(screen.getByTestId('mermaid-zoom-controls')).toBeInTheDocument();
    expect(screen.getByTestId('mermaid-export')).toHaveTextContent(
      'com_ui_mermaid_diagram:<svg viewBox="0 0 400 200" />',
    );
  });

  it('switches exclusively between the inline diagram and its source', () => {
    const { container } = render(<Mermaid id="mermaid-0">{'graph TD\nA-->B'}</Mermaid>);

    expect(screen.getByRole('img', { name: 'com_ui_mermaid_diagram' })).toBeInTheDocument();
    expect(container.querySelector('pre')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_show_code' }));

    expect(container.querySelector('pre')?.textContent).toBe('graph TD\nA-->B');
    expect(screen.queryByRole('img', { name: 'com_ui_mermaid_diagram' })).not.toBeInTheDocument();
    expect(screen.getByTestId('mermaid-zoom-controls')).not.toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_preview' }));

    expect(screen.getByRole('img', { name: 'com_ui_mermaid_diagram' })).toBeInTheDocument();
    expect(container.querySelector('pre')).toBeNull();
  });

  it('keeps export controls while showing the last valid streaming diagram', () => {
    mockSvgProcessingState = {
      ...mockSvgProcessingState,
      isLoading: true,
      lastValidSvgRef: { current: '<svg width="400" height="200" />' },
    };

    render(<Mermaid id="mermaid-0">{'graph TD\nA-->B'}</Mermaid>);

    expect(screen.getByRole('img', { name: 'com_ui_mermaid_diagram' })).toBeInTheDocument();
    expect(screen.getByTestId('mermaid-export')).toHaveTextContent(mockProcessedSvg);
  });

  it('switches to the current source while a last-valid diagram is streaming', () => {
    mockSvgProcessingState = {
      ...mockSvgProcessingState,
      isLoading: true,
      lastValidSvgRef: { current: '<svg width="400" height="200" />' },
    };
    const { container } = render(<Mermaid id="mermaid-0">{'graph TD\nA-->B'}</Mermaid>);

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_show_code' }));

    expect(container.querySelector('pre')?.textContent).toBe('graph TD\nA-->B');
    expect(screen.queryByRole('img', { name: 'com_ui_mermaid_diagram' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_preview' }));

    expect(screen.getByRole('img', { name: 'com_ui_mermaid_diagram' })).toBeInTheDocument();
    expect(container.querySelector('pre')).toBeNull();
  });

  it('opens the expanded dialog from the header', () => {
    render(<Mermaid id="mermaid-0">{'graph TD\nA-->B'}</Mermaid>);

    expect(screen.queryByTestId('mermaid-dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: mockExpandLabel }));

    expect(screen.getByTestId('mermaid-dialog')).toBeInTheDocument();
  });

  it('renders a toolbar-free loading state without exposing source', () => {
    mockSvgProcessingState = {
      ...mockSvgProcessingState,
      isLoading: true,
      lastValidSvgRef: { current: null },
    };
    const { container } = render(
      <MermaidRenderer
        exportFilename="Flow chart"
        fillContainer
        showExpandButton={false}
        showHeader={false}
      >
        {'graph TD\nA-->B'}
      </MermaidRenderer>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('com_ui_loading');
    expect(screen.getByRole('status')).toHaveClass('h-full', 'rounded-xl');
    expect(container.querySelector('pre')).toBeNull();
  });

  it('withdraws the export payload when the renderer unmounts', async () => {
    const onExportReady = jest.fn();

    const { unmount } = render(
      <MermaidRenderer
        exportFilename="Flow chart"
        onExportReady={onExportReady}
        showExpandButton={false}
        showHeader={false}
      >
        {'graph TD\nA-->B'}
      </MermaidRenderer>,
    );

    await waitFor(() =>
      expect(onExportReady).toHaveBeenCalledWith({
        svg: mockProcessedSvg,
        dimensions: { width: 400, height: 200 },
      }),
    );

    unmount();

    expect(onExportReady).toHaveBeenLastCalledWith(null);
  });

  it('renders separate diagrams for blocks without explicit IDs', () => {
    render(
      <>
        <Mermaid>{'graph TD\nA-->B'}</Mermaid>
        <Mermaid>{'graph TD\nC-->D'}</Mermaid>
      </>,
    );

    expect(screen.getAllByRole('img', { name: 'com_ui_mermaid_diagram' })).toHaveLength(2);
  });
});
