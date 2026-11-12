import { useCallback, useEffect, useRef, useState } from 'react';
import { useToastContext } from '@librechat/client';
import type { Artifact } from '~/common';
import {
  useAttachmentLink,
  isLocallyStoredSource,
} from '~/components/Chat/Messages/Content/Parts/LogLink';
import { getArtifactDownloadFilename, getOriginalArtifactFilename } from '~/utils/artifacts';
import useLocalize from '~/hooks/useLocalize';

export interface ArtifactDownload {
  /** Briefly true after a file actually reached the user, for the check-mark swap. */
  isDownloaded: boolean;
  /** Resolves to whether bytes actually reached the user. */
  handleDownload: (event: React.MouseEvent<HTMLElement>) => Promise<boolean>;
}

/**
 * Saves an artifact to disk. Generated files download through their original
 * attachment route so the user gets the real binary; documents are serialized
 * from the panel text.
 */
export default function useArtifactDownload(artifact: Artifact): ArtifactDownload {
  const { showToast } = useToastContext();
  const localize = useLocalize();
  const [isDownloaded, setIsDownloaded] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const { download } = artifact;
  const generatedFile = download?.generatedFile;
  /* Only take the original-file branch when `useAttachmentLink` can actually
   * fetch something: a usable filepath or enough metadata for the local-file
   * API path. A shared link that dropped those fields falls back to content. */
  const hasUsableRoute =
    (download?.filepath != null && download.filepath !== '') ||
    (download?.file_id != null &&
      download?.user != null &&
      isLocallyStoredSource(download?.source));
  const fileKey = download?.filename ?? artifact.title ?? 'document.md';
  const { handleDownload: downloadAttachment } = useAttachmentLink({
    href: download?.filepath ?? '',
    filename: getOriginalArtifactFilename(artifact, fileKey),
    file_id: download?.file_id,
    user: download?.user,
    source: download?.source,
  });

  const markDownloaded = useCallback(() => {
    setIsDownloaded(true);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setIsDownloaded(false), 3000);
  }, []);

  const handleDownload = useCallback(
    async (event: React.MouseEvent<HTMLElement>): Promise<boolean> => {
      try {
        if (hasUsableRoute) {
          const downloaded = await downloadAttachment(event);
          if (downloaded) {
            markDownloaded();
          }
          return downloaded;
        }
        /* A generated file without its original route has no honest bytes to
         * offer: the cached preview is not the binary. */
        if (generatedFile != null) {
          showToast({ status: 'error', message: localize('com_ui_download_error') });
          return false;
        }
        const content = artifact.content;
        if (content == null) {
          showToast({ status: 'error', message: localize('com_ui_download_error') });
          return false;
        }
        const blob = new Blob([content], { type: 'text/markdown' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = getArtifactDownloadFilename(artifact, fileKey, content);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        markDownloaded();
        return true;
      } catch (error) {
        console.error('Download failed:', error);
        showToast({ status: 'error', message: localize('com_ui_download_error') });
        return false;
      }
    },
    [
      artifact,
      downloadAttachment,
      generatedFile,
      fileKey,
      hasUsableRoute,
      localize,
      markDownloaded,
      showToast,
    ],
  );

  return { isDownloaded, handleDownload };
}
