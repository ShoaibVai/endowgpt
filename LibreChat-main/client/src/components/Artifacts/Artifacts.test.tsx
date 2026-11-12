import React from 'react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Artifact } from '~/common';
import Artifacts from './Artifacts';
import store from '~/store';

const mockUseArtifacts = jest.fn();
let mockIsMobile = false;
let mockPrefersReducedMotion = false;

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useMediaQuery: (query: string) =>
    query === '(prefers-reduced-motion: reduce)' ? mockPrefersReducedMotion : false,
}));

jest.mock('~/hooks/useScaledMaxWidth', () => ({
  __esModule: true,
  default: () => mockIsMobile,
}));

jest.mock('~/Providers', () => ({
  useShareContext: () => ({ isSharedConvo: false }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useFocusTrap: (
    containerRef: React.RefObject<HTMLElement | null>,
    active: boolean,
    onEscape?: () => void,
  ) => {
    const ReactModule = jest.requireActual<typeof import('react')>('react');
    ReactModule.useEffect(() => {
      if (!active) {
        return;
      }
      const container = containerRef.current;
      const firstFocusable = container?.querySelector<HTMLElement>('button, [tabindex="0"]');
      firstFocusable?.focus();
      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          onEscape?.();
        }
      };
      container?.addEventListener('keydown', handleKeyDown);
      return () => container?.removeEventListener('keydown', handleKeyDown);
    }, [active, containerRef, onEscape]);
  },
}));

jest.mock('~/hooks/Artifacts/useArtifacts', () => ({
  __esModule: true,
  default: () => mockUseArtifacts(),
}));

jest.mock('./ArtifactTabs', () => ({
  __esModule: true,
  default: ({ artifact }: { artifact: Artifact }) => (
    <div data-testid="artifact-content">{artifact.title}</div>
  ),
}));

jest.mock('./ArtifactVersion', () => ({
  __esModule: true,
  default: ({ totalVersions }: { totalVersions: number }) => (
    <div data-testid="artifact-versions">{totalVersions}</div>
  ),
}));

jest.mock('./DownloadArtifact', () => ({
  __esModule: true,
  default: () => <button type="button">download-artifact</button>,
}));

jest.mock('~/components/Messages/Content/CopyButton', () => ({
  __esModule: true,
  default: () => <button type="button">copy-artifact</button>,
}));

const documentArtifact: Artifact = {
  id: 'document-1',
  type: 'application/vnd.endowgpt.document',
  title: 'Plan',
  content: '# Plan',
  lastUpdateTime: 2,
};

const olderArtifact: Artifact = {
  id: 'document-0',
  type: 'application/vnd.endowgpt.document',
  title: 'Old plan',
  content: '# Old plan',
  lastUpdateTime: 1,
};

const ArtifactStateProbe = () => {
  const currentArtifactId = useRecoilValue(store.currentArtifactId);
  const isVisible = useRecoilValue(store.artifactsVisibility);
  return (
    <output
      data-testid="artifact-state"
      data-current-id={currentArtifactId ?? ''}
      data-visible={isVisible}
    />
  );
};

describe('Artifacts panel', () => {
  beforeEach(() => {
    mockIsMobile = false;
    mockPrefersReducedMotion = false;
    mockUseArtifacts.mockReturnValue({
      currentIndex: 1,
      currentArtifact: documentArtifact,
      orderedArtifactIds: [olderArtifact.id, documentArtifact.id],
      setCurrentArtifactId: jest.fn(),
    });
  });

  it('renders a document with its title, actions and editor', async () => {
    render(
      <RecoilRoot>
        <Artifacts />
      </RecoilRoot>,
    );

    const region = await screen.findByRole('region', { name: 'Plan' });
    expect(region).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Plan' })).toBeInTheDocument();
    expect(screen.getByTestId('artifact-versions')).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: 'copy-artifact' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'download-artifact' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'com_ui_close' })).toBeInTheDocument();
    expect(screen.getByTestId('artifact-content')).toHaveTextContent('Plan');
  });

  it('keeps the panel id distinct from the content area', async () => {
    const { container } = render(
      <RecoilRoot>
        <div id="artifacts-panel">
          <Artifacts />
        </div>
      </RecoilRoot>,
    );

    await screen.findByRole('region', { name: 'Plan' });
    expect(container.querySelectorAll('#artifact-viewer')).toHaveLength(1);
  });

  it('opens as a full-screen dialog on mobile and restores focus when closed', async () => {
    mockIsMobile = true;
    const opener = document.createElement('button');
    opener.textContent = 'Open document';
    document.body.appendChild(opener);
    opener.focus();

    render(
      <RecoilRoot
        initializeState={({ set }) => {
          set(store.currentArtifactId, documentArtifact.id);
          set(store.artifactsVisibility, true);
        }}
      >
        <ArtifactStateProbe />
        <Artifacts />
      </RecoilRoot>,
    );

    const dialog = await screen.findByRole('dialog', { name: 'Plan' });
    expect(dialog).toHaveClass('fixed', 'inset-0');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'copy-artifact' })).toHaveFocus(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_close' }));

    await waitFor(() =>
      expect(screen.getByTestId('artifact-state')).toHaveAttribute('data-current-id', ''),
    );
    expect(screen.getByTestId('artifact-state')).toHaveAttribute('data-visible', 'false');
    await waitFor(() => expect(opener).toHaveFocus());

    opener.remove();
  });

  it('closes immediately when reduced motion is preferred', async () => {
    mockIsMobile = true;
    mockPrefersReducedMotion = true;

    render(
      <RecoilRoot
        initializeState={({ set }) => {
          set(store.currentArtifactId, documentArtifact.id);
          set(store.artifactsVisibility, true);
        }}
      >
        <ArtifactStateProbe />
        <Artifacts />
      </RecoilRoot>,
    );

    await screen.findByRole('dialog', { name: 'Plan' });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_close' }));

    expect(screen.getByTestId('artifact-state')).toHaveAttribute('data-current-id', '');
    expect(screen.getByTestId('artifact-state')).toHaveAttribute('data-visible', 'false');
  });

  it('hides the document copy action for generated files', async () => {
    mockUseArtifacts.mockReturnValue({
      currentIndex: 0,
      currentArtifact: {
        id: 'tool-artifact-file-1',
        type: 'application/vnd.librechat.spreadsheet-preview',
        title: 'data.xlsx',
        content: '',
        lastUpdateTime: 1,
        download: {
          filename: 'data.xlsx',
          generatedFile: {
            version: 1,
            tool: 'write_file',
            kind: 'spreadsheet',
            format: 'xlsx',
          },
        },
      },
      orderedArtifactIds: ['tool-artifact-file-1'],
      setCurrentArtifactId: jest.fn(),
    });

    render(
      <RecoilRoot>
        <Artifacts />
      </RecoilRoot>,
    );

    await screen.findByRole('region', { name: 'data.xlsx' });
    expect(screen.queryByRole('button', { name: 'copy-artifact' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'download-artifact' })).toBeInTheDocument();
  });
});
