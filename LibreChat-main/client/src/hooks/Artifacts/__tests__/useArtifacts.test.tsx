import React from 'react';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import type { Artifact } from '~/common';
import type { MutableSnapshot } from 'recoil';
import { useArtifactsContext } from '~/Providers';
import useArtifacts from '../useArtifacts';
import store from '~/store';

jest.mock('~/Providers', () => ({
  useArtifactsContext: jest.fn(),
}));

jest.mock('~/utils', () => ({
  logger: { log: jest.fn() },
}));

const buildArtifact = (id: string, lastUpdateTime: number): Artifact => ({
  id,
  title: id,
  type: 'application/vnd.endowgpt.document',
  content: `# ${id}`,
  lastUpdateTime,
});

const mockContext = useArtifactsContext as jest.Mock;

type InitialState = {
  artifacts?: Record<string, Artifact>;
  currentId?: string | null;
  visible?: boolean;
};

const makeWrapper =
  (initial: InitialState = {}) =>
  ({ children }: { children: React.ReactNode }) => (
    <RecoilRoot
      initializeState={(snapshot: MutableSnapshot) => {
        snapshot.set(store.artifactsState, initial.artifacts ?? null);
        snapshot.set(store.currentArtifactId, initial.currentId ?? null);
        snapshot.set(store.artifactsVisibility, initial.visible ?? true);
      }}
    >
      {children}
    </RecoilRoot>
  );

describe('useArtifacts', () => {
  beforeEach(() => {
    mockContext.mockReturnValue({ conversationId: 'conv-1' });
  });

  it('orders artifacts by their latest update', () => {
    const { result } = renderHook(() => useArtifacts(), {
      wrapper: makeWrapper({
        artifacts: {
          older: buildArtifact('older', 1),
          newer: buildArtifact('newer', 3),
          middle: buildArtifact('middle', 2),
        },
      }),
    });

    expect(result.current.orderedArtifactIds).toEqual(['older', 'middle', 'newer']);
  });

  it('selects the latest artifact when nothing is focused', async () => {
    const { result } = renderHook(() => useArtifacts(), {
      wrapper: makeWrapper({
        artifacts: {
          older: buildArtifact('older', 1),
          newer: buildArtifact('newer', 3),
        },
      }),
    });

    await waitFor(() => expect(result.current.currentArtifact?.id).toBe('newer'));
    expect(result.current.currentIndex).toBe(1);
  });

  it('keeps a focused artifact that is still registered', () => {
    const { result } = renderHook(() => useArtifacts(), {
      wrapper: makeWrapper({
        artifacts: {
          older: buildArtifact('older', 1),
          newer: buildArtifact('newer', 3),
        },
        currentId: 'older',
      }),
    });

    expect(result.current.currentArtifact?.id).toBe('older');
    expect(result.current.setCurrentArtifactId).toEqual(expect.any(Function));
  });

  it('resets the registry when the conversation changes', async () => {
    const { result, rerender } = renderHook(() => useArtifacts(), {
      wrapper: makeWrapper({ artifacts: { doc: buildArtifact('doc', 1) } }),
    });

    expect(result.current.orderedArtifactIds).toEqual(['doc']);

    mockContext.mockReturnValue({ conversationId: 'conv-2' });
    rerender();

    await waitFor(() => expect(result.current.orderedArtifactIds).toEqual([]));
    expect(result.current.currentArtifact).toBeNull();
  });

  it('resets the registry for a new chat', async () => {
    const { result, rerender } = renderHook(() => useArtifacts(), {
      wrapper: makeWrapper({ artifacts: { doc: buildArtifact('doc', 1) } }),
    });

    mockContext.mockReturnValue({ conversationId: 'new' });
    rerender();

    await waitFor(() => expect(result.current.orderedArtifactIds).toEqual([]));
  });

  it('clears the registry on unmount when the pane is closed', () => {
    let observed: Record<string, Artifact | undefined> | null = {
      doc: buildArtifact('doc', 1),
    };
    const Probe = () => {
      observed = useRecoilValue(store.artifactsState);
      return null;
    };
    const Pane = () => {
      useArtifacts();
      return null;
    };
    const App = ({ open }: { open: boolean }) => (
      <RecoilRoot
        initializeState={(snapshot: MutableSnapshot) => {
          snapshot.set(store.artifactsState, { doc: buildArtifact('doc', 1) });
          snapshot.set(store.currentArtifactId, 'doc');
          snapshot.set(store.artifactsVisibility, false);
        }}
      >
        <Probe />
        {open ? <Pane /> : null}
      </RecoilRoot>
    );

    const { rerender } = render(<App open />);
    expect(observed).not.toBeNull();

    rerender(<App open={false} />);

    expect(observed).toBeNull();
  });

  it('keeps the registry on unmount while the pane is still visible', () => {
    let observed: Record<string, Artifact | undefined> | null = null;
    const Probe = () => {
      observed = useRecoilValue(store.artifactsState);
      return null;
    };
    const Pane = () => {
      useArtifacts();
      return null;
    };
    const App = ({ open }: { open: boolean }) => (
      <RecoilRoot
        initializeState={(snapshot: MutableSnapshot) => {
          snapshot.set(store.artifactsState, { doc: buildArtifact('doc', 1) });
          snapshot.set(store.currentArtifactId, 'doc');
          snapshot.set(store.artifactsVisibility, true);
        }}
      >
        <Probe />
        {open ? <Pane /> : null}
      </RecoilRoot>
    );

    const { rerender } = render(<App open />);
    expect(observed).toEqual({ doc: buildArtifact('doc', 1) });

    act(() => rerender(<App open={false} />));

    expect(observed).toEqual({ doc: buildArtifact('doc', 1) });
  });
});
