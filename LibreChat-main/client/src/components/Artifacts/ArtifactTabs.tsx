import { Suspense, useRef } from 'react';
import { Spinner } from '@librechat/client';
import * as Tabs from '@radix-ui/react-tabs';
import type { SandpackPreviewRef } from '@codesandbox/sandpack-react/unstyled';
import type { editor } from 'monaco-editor';
import type { ProcessedMermaidSvg } from '~/utils/diagram/export';
import { MermaidRenderer } from '~/components/Messages/Content/Mermaid/Mermaid';
import { MERMAID_ARTIFACT_TYPE, type Artifact } from '~/common/artifacts';
import { ArtifactCodeEditor } from './ArtifactCodeEditor';
import { useArtifactCode } from '~/Providers/EditorContext';
import { normalizeArtifactType } from '~/utils/artifacts';
import { TOOL_ARTIFACT_TYPES } from '~/utils/artifacts';
import { lazyWithRecovery } from '~/lib/assets/lazy';
import { useLocalize } from '~/hooks';

const SandboxArtifactTabs = lazyWithRecovery(() => import('./SandboxArtifactTabs'));
const DocumentTabs = lazyWithRecovery(() => import('./Document'));
const GeneratedFileTabs = lazyWithRecovery(() => import('./GeneratedFileTabs'));

interface ArtifactTabsProps {
  artifact: Artifact;
  previewRef: React.MutableRefObject<SandpackPreviewRef>;
  isSharedConvo?: boolean;
  onMermaidExportReady?: (data: ProcessedMermaidSvg | null) => void;
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

function MermaidArtifactTabs({
  artifact,
  isSharedConvo,
  onMermaidExportReady,
}: Omit<ArtifactTabsProps, 'previewRef'>) {
  const localize = useLocalize();
  const editedCode = useArtifactCode(artifact.id);
  const monacoRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  /* The buffer belongs to whichever artifact last wrote it: a freshly keyed
   * renderer must not show (or export) the diagram we navigated away from,
   * while a pane that remounted for another host keeps its unsaved text and a
   * displaced copy is just as much this artifact's own. */
  const content = editedCode ?? artifact.content ?? '';
  const isReadOnly = isSharedConvo === true || artifact.index == null;

  return (
    <div className="flex h-full w-full flex-col">
      <Tabs.Content
        value="code"
        id="artifacts-code"
        className="h-full w-full grow overflow-auto"
        tabIndex={-1}
      >
        <ArtifactCodeEditor artifact={artifact} monacoRef={monacoRef} readOnly={isReadOnly} />
      </Tabs.Content>

      <Tabs.Content
        value="preview"
        className="min-h-0 w-full flex-1 overflow-hidden p-4"
        tabIndex={-1}
      >
        {/* Keyed by artifact so switching between two diagrams cannot carry the
            previous render, its dimensions, or its export payload across the
            boundary while the new source debounces. */}
        <MermaidRenderer
          key={artifact.id}
          exportFilename={artifact.title ?? localize('com_ui_mermaid_diagram')}
          fillContainer
          onExportReady={onMermaidExportReady}
          showExpandButton={false}
          showHeader={false}
        >
          {content}
        </MermaidRenderer>
      </Tabs.Content>
    </div>
  );
}

/** endowGPT document artifacts load after the TipTap editor module; shared
 *  panel chrome (copy, download, versions) is unchanged because Artifacts
 *  renders around these tabs. */
export default function ArtifactTabs(props: ArtifactTabsProps) {
  const artifactType = normalizeArtifactType(props.artifact.type ?? '');
  if (artifactType === MERMAID_ARTIFACT_TYPE) {
    return (
      <MermaidArtifactTabs
        artifact={props.artifact}
        isSharedConvo={props.isSharedConvo}
        onMermaidExportReady={props.onMermaidExportReady}
      />
    );
  }
  if (artifactType === TOOL_ARTIFACT_TYPES.DOCUMENT) {
    return (
      <Suspense fallback={<LoadingArtifactTabs />}>
        <DocumentTabs artifact={props.artifact} isSharedConvo={props.isSharedConvo} />
      </Suspense>
    );
  }
  if (props.artifact.download?.generatedFile != null) {
    return (
      <Suspense fallback={<LoadingArtifactTabs />}>
        <GeneratedFileTabs artifact={props.artifact} />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<LoadingArtifactTabs />}>
      <SandboxArtifactTabs {...props} />
    </Suspense>
  );
}
