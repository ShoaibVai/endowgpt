import { memo, useEffect, useId, useLayoutEffect } from 'react';
import type { TAttachment, TFile, TAttachmentMetadata } from 'librechat-data-provider';
import type { Artifact } from '~/common';
import { useMessagePartsHost } from '~/Providers/MessagePartsHostContext';
import { useAttachmentLink } from './LogLink';
import FileCard from './FileCard';

interface ToolArtifactCardProps {
  attachment: TAttachment;
  artifact: Artifact;
}

/**
 * Card that opens a generated file in the side panel.
 *
 * Dedup claims make the latest card for one file the canonical trigger, and
 * registration keeps the panel's registry in step with the attachment. The
 * card is click-to-open: opening a viewer over the conversation as soon as a
 * tool returns would steal focus from the answer the user is reading.
 */
const ToolArtifactCard = memo(({ attachment, artifact }: ToolArtifactCardProps) => {
  const claimKey = useId();
  const { useArtifactPanel, useToolArtifactClaim } = useMessagePartsHost();
  const file = attachment as TFile & TAttachmentMetadata;
  const {
    currentArtifactId,
    registered: existingEntry,
    register,
    open,
    close,
  } = useArtifactPanel(artifact.id);
  const [claim, setClaim] = useToolArtifactClaim(artifact.id);
  const isSelected = artifact.id === currentArtifactId;
  const isMyClaim = claim === claimKey;

  useLayoutEffect(() => {
    // Always (re)claim on mount — a later card for the same id displaces
    // an earlier one, so the chip migrates to the most recent mention.
    setClaim(claimKey);
    return () => {
      // Only release when the claim is still ours; if a sibling already
      // took over we don't want to clobber its claim.
      setClaim((prev) => (prev === claimKey ? null : prev));
    };
  }, [claimKey, setClaim]);

  useEffect(() => {
    // Only the claim-winner writes. Two cards with the same `artifact.id`
    // but divergent content (same file_id reused across turns) would
    // otherwise see each other's write through `existingEntry`, detect
    // drift, and trade overwrites in a loop.
    if (!isMyClaim) {
      return;
    }
    if (
      existingEntry != null &&
      existingEntry.content === artifact.content &&
      existingEntry.type === artifact.type &&
      existingEntry.title === artifact.title
    ) {
      return;
    }
    register(artifact);
  }, [artifact, existingEntry, isMyClaim, register]);

  const { handleDownload } = useAttachmentLink({
    href: attachment.filepath ?? '',
    filename: attachment.filename ?? '',
    file_id: file.file_id,
    user: file.user,
    source: file.source,
  });

  const handleOpen = () => {
    if (isSelected) {
      close();
      return;
    }
    open(artifact.id);
  };

  // Another card with the same artifact id has the active claim — render
  // nothing here, that row is the canonical trigger for this file.
  if (claim != null && !isMyClaim) {
    return null;
  }

  if (artifact.download?.generatedFile == null) {
    return null;
  }

  return (
    <FileCard
      artifact={artifact}
      isSelected={isSelected}
      onOpen={handleOpen}
      onDownload={handleDownload}
    />
  );
});

ToolArtifactCard.displayName = 'ToolArtifactCard';

export default ToolArtifactCard;
