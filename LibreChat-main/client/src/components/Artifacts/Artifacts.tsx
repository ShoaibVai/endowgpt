import { useRef, useState, useEffect, useCallback } from 'react';
import copy from 'copy-to-clipboard';
import { FileText, X } from 'lucide-react';
import * as Tabs from '@radix-ui/react-tabs';
import { useSetRecoilState, useResetRecoilState } from 'recoil';
import { Button, useMediaQuery, useToastContext } from '@librechat/client';
import { displayFilename } from '~/components/Chat/Messages/Content/Parts/attachmentTypes';
import { normalizeArtifactType, TOOL_ARTIFACT_TYPES } from '~/utils/artifacts';
import CopyButton from '~/components/Messages/Content/CopyButton';
import { ARTIFACTS_SHEET_MAX_WIDTH } from '~/utils/breakpoints';
import useArtifacts from '~/hooks/Artifacts/useArtifacts';
import useScaledMaxWidth from '~/hooks/useScaledMaxWidth';
import { useFocusTrap, useLocalize } from '~/hooks';
import DownloadArtifact from './DownloadArtifact';
import ArtifactVersion from './ArtifactVersion';
import { useShareContext } from '~/Providers';
import ArtifactTabs from './ArtifactTabs';
import { cn } from '~/utils';
import store from '~/store';

export default function Artifacts() {
  const localize = useLocalize();
  const { isSharedConvo } = useShareContext();
  const isMobile = useScaledMaxWidth(ARTIFACTS_SHEET_MAX_WIDTH);
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const setArtifactsVisible = useSetRecoilState(store.artifactsVisibility);
  const resetCurrentArtifactId = useResetRecoilState(store.currentArtifactId);
  const { showToast } = useToastContext();

  const { currentIndex, currentArtifact, orderedArtifactIds, setCurrentArtifactId } =
    useArtifacts();

  useEffect(() => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement !== document.body) {
      openerRef.current = activeElement;
    }
    setIsMounted(true);
    const timer = setTimeout(() => setIsVisible(true), isMobile ? 50 : 30);
    return () => {
      clearTimeout(timer);
      setIsMounted(false);
    };
  }, [isMobile]);

  const restoreArtifactTriggerFocus = useCallback(() => {
    const opener = openerRef.current;
    const artifactId = currentArtifact?.id;
    requestAnimationFrame(() => {
      if (opener?.isConnected) {
        opener.focus();
        return;
      }
      const trigger = Array.from(
        document.querySelectorAll<HTMLElement>('[data-artifact-trigger]'),
      ).find((element) => element.dataset.artifactTrigger === artifactId);
      trigger?.focus();
    });
  }, [currentArtifact?.id]);

  const closeArtifacts = useCallback(() => {
    if (isMobile) {
      setIsClosing(true);
      setIsVisible(false);
      const finishClose = () => {
        resetCurrentArtifactId();
        setArtifactsVisible(false);
        setIsClosing(false);
        restoreArtifactTriggerFocus();
      };
      if (prefersReducedMotion) {
        finishClose();
      } else {
        setTimeout(finishClose, 200);
      }
      return;
    }

    resetCurrentArtifactId();
    setArtifactsVisible(false);
    restoreArtifactTriggerFocus();
  }, [
    isMobile,
    prefersReducedMotion,
    resetCurrentArtifactId,
    restoreArtifactTriggerFocus,
    setArtifactsVisible,
  ]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeArtifacts();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeArtifacts, isVisible]);

  useFocusTrap(panelRef, isMobile && isVisible && !isClosing, closeArtifacts);

  const handleCopyArtifact = useCallback(async () => {
    const content = currentArtifact?.content ?? '';
    if (!content) {
      return;
    }
    let copied = false;
    try {
      await navigator.clipboard.writeText(content);
      copied = true;
    } catch {
      copied = copy(content, { format: 'text/plain' });
    }
    if (!copied) {
      showToast({ status: 'error', message: localize('com_ui_copy_failed') });
      return;
    }
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 3000);
  }, [currentArtifact?.content, localize, showToast]);

  if (!currentArtifact || !isMounted) {
    return null;
  }

  const isDocument =
    normalizeArtifactType(currentArtifact.type ?? '') === TOOL_ARTIFACT_TYPES.DOCUMENT;
  const title = displayFilename(currentArtifact.title) || localize('com_ui_artifacts');

  return (
    <Tabs.Root value="preview" asChild>
      <div className="bg-surface-primary flex h-full w-full flex-col">
        {isMobile && (
          <div
            className={cn(
              'bg-surface-overlay fixed inset-0 z-[99] motion-reduce:transition-none',
              isVisible && !isClosing
                ? 'opacity-100 transition-opacity duration-200'
                : 'pointer-events-none opacity-0',
            )}
            onClick={closeArtifacts}
            aria-hidden="true"
          />
        )}
        <div
          ref={panelRef}
          id="artifact-viewer"
          role={isMobile ? 'dialog' : 'region'}
          aria-modal={isMobile || undefined}
          aria-label={title}
          className={cn(
            'bg-surface-primary text-text-primary flex w-full flex-col motion-reduce:transition-none',
            isMobile
              ? cn(
                  'fixed inset-0 z-[100] shadow-[0_-10px_60px_rgba(0,0,0,0.35)]',
                  isVisible && !isClosing
                    ? 'translate-y-0 opacity-100'
                    : 'translate-y-full opacity-0',
                  !isClosing && 'transition-all duration-200',
                )
              : cn(
                  'h-full overflow-hidden shadow-2xl',
                  isVisible && !isClosing
                    ? 'translate-x-0 opacity-100 transition-all duration-300'
                    : 'translate-x-4 opacity-0 transition-all duration-200 rtl:-translate-x-4',
                ),
          )}
        >
          <div className="border-border-light bg-surface-primary-alt flex h-[3.25rem] shrink-0 items-center justify-between gap-2 border-b px-3">
            <div className="flex min-w-0 items-center gap-2">
              <FileText className="text-text-secondary size-4 shrink-0" aria-hidden="true" />
              <h2 className="min-w-0 truncate text-sm font-medium" title={title}>
                {title}
              </h2>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {orderedArtifactIds.length > 1 && (
                <ArtifactVersion
                  currentIndex={currentIndex}
                  totalVersions={orderedArtifactIds.length}
                  onVersionChange={(index) => {
                    const target = orderedArtifactIds[index];
                    if (target) {
                      setCurrentArtifactId(target);
                    }
                  }}
                />
              )}
              {isDocument && (
                <CopyButton isCopied={isCopied} iconOnly onClick={handleCopyArtifact} />
              )}
              <DownloadArtifact artifact={currentArtifact} />
              <Button
                size="icon"
                variant="ghost"
                className="h-9 w-9"
                onClick={closeArtifacts}
                aria-label={localize('com_ui_close')}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>

          <div className="relative min-h-0 flex-1 overflow-hidden">
            <ArtifactTabs artifact={currentArtifact} isSharedConvo={isSharedConvo} />
          </div>
        </div>
      </div>
    </Tabs.Root>
  );
}
