import { Suspense } from 'react';
import { Spinner } from '@librechat/client';
import type { Artifact } from '~/common';
import { normalizeArtifactType, TOOL_ARTIFACT_TYPES } from '~/utils/artifacts';
import { lazyWithRecovery } from '~/lib/assets/lazy';
import { useLocalize } from '~/hooks';

const DocumentTabs = lazyWithRecovery(() => import('./Document'));
const FilePreview = lazyWithRecovery(() => import('./FilePreview'));

interface ArtifactTabsProps {
  artifact: Artifact;
  isSharedConvo?: boolean;
}

function LoadingArtifactTabs() {
  const localize = useLocalize();

  return (
    <div
      className="bg-surface-primary text-text-secondary flex h-full w-full items-center justify-center"
      role="status"
    >
      <Spinner className="size-5" aria-hidden="true" />
      <span className="sr-only">{localize('com_ui_loading')}</span>
    </div>
  );
}

/** The panel only mounts for editable documents and generated files. */
export default function ArtifactTabs({ artifact, isSharedConvo }: ArtifactTabsProps) {
  const artifactType = normalizeArtifactType(artifact.type ?? '');

  if (artifactType === TOOL_ARTIFACT_TYPES.DOCUMENT) {
    return (
      <Suspense fallback={<LoadingArtifactTabs />}>
        <DocumentTabs artifact={artifact} isSharedConvo={isSharedConvo} />
      </Suspense>
    );
  }

  if (artifact.download?.generatedFile != null) {
    return (
      <Suspense fallback={<LoadingArtifactTabs />}>
        <FilePreview artifact={artifact} />
      </Suspense>
    );
  }

  /* A conversation saved by an older build can still focus a stock artifact.
   * Its content is shown as readable text rather than a blank panel. */
  return (
    <div className="preview-scroll h-full w-full overflow-auto p-6">
      <pre className="text-text-primary font-mono text-sm leading-6 break-words whitespace-pre-wrap">
        {artifact.content}
      </pre>
    </div>
  );
}
