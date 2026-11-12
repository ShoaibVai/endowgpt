import { useMemo, useEffect, useRef } from 'react';
import { Constants } from 'librechat-data-provider';
import { useRecoilCallback, useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil';
import { useArtifactsContext } from '~/Providers';
import { logger } from '~/utils';
import store from '~/store';

/**
 * Selection and lifetime for the document/file panel. The panel only shows
 * editable documents and generated files, so there is no tab state and no
 * source/preview split to coordinate.
 */
export default function useArtifacts() {
  const { conversationId } = useArtifactsContext();
  const artifacts = useRecoilValue(store.artifactsState);
  const resetArtifacts = useResetRecoilState(store.artifactsState);
  const resetCurrentArtifactId = useResetRecoilState(store.currentArtifactId);
  const [currentArtifactId, setCurrentArtifactId] = useRecoilState(store.currentArtifactId);

  const orderedArtifactIds = useMemo(
    () =>
      Object.keys(artifacts ?? {}).sort(
        (a, b) => (artifacts?.[a]?.lastUpdateTime ?? 0) - (artifacts?.[b]?.lastUpdateTime ?? 0),
      ),
    [artifacts],
  );

  const prevConversationIdRef = useRef<string | null>(null);

  /**
   * The pane closes by unmounting, so clearing the registry on every unmount
   * would also clear it while the pane moves hosts. Closing clears visibility
   * and the focused id first; a fresh snapshot tells the two apart.
   */
  const isPaneClosed = useRecoilCallback(
    ({ snapshot }) =>
      () =>
        snapshot.getLoadable(store.artifactsVisibility).valueMaybe() !== true ||
        snapshot.getLoadable(store.currentArtifactId).valueMaybe() == null,
    [],
  );

  useEffect(() => {
    const resetState = () => {
      resetArtifacts();
      resetCurrentArtifactId();
      prevConversationIdRef.current = conversationId;
    };
    if (conversationId !== prevConversationIdRef.current && prevConversationIdRef.current != null) {
      resetState();
    } else if (conversationId === Constants.NEW_CONVO) {
      resetState();
    }
    prevConversationIdRef.current = conversationId;
    return () => {
      if (!isPaneClosed()) {
        return;
      }
      logger.log('artifacts_visibility', 'Unmounting artifacts');
      resetState();
    };
  }, [conversationId, isPaneClosed, resetArtifacts, resetCurrentArtifactId]);

  /**
   * Read the focused id without subscribing as a dependency; adding it would
   * re-run selection on every reset and break toggle-close.
   */
  const currentArtifactIdRef = useRef(currentArtifactId);
  currentArtifactIdRef.current = currentArtifactId;

  useEffect(() => {
    if (orderedArtifactIds.length === 0) {
      return;
    }
    const currentId = currentArtifactIdRef.current;
    if (currentId != null && orderedArtifactIds.includes(currentId)) {
      return;
    }
    const latest = orderedArtifactIds[orderedArtifactIds.length - 1];
    if (latest != null) {
      setCurrentArtifactId(latest);
    }
  }, [orderedArtifactIds, setCurrentArtifactId]);

  const currentArtifact = currentArtifactId != null ? artifacts?.[currentArtifactId] : null;

  return {
    currentIndex: orderedArtifactIds.indexOf(currentArtifactId ?? ''),
    currentArtifact,
    orderedArtifactIds,
    setCurrentArtifactId,
  };
}
