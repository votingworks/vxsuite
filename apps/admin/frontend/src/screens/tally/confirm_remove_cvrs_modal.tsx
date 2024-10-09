import { Modal, P, Button } from '@votingworks/ui';
import React from 'react';
import {
  getManualResultsMetadata,
  getCastVoteRecordFiles,
  getCastVoteRecordFileMode,
  clearCastVoteRecordFiles,
  deleteAllManualResults,
} from '../../api';

export function ConfirmRemoveCvrsModal({
  onClose,
}: {
  onClose: VoidFunction;
}): JSX.Element | null {
  const manualDataResultsMetadataQuery = getManualResultsMetadata.useQuery();
  const castVoteRecordFilesQuery = getCastVoteRecordFiles.useQuery();
  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const clearCastVoteRecordFilesMutation =
    clearCastVoteRecordFiles.useMutation();
  const deleteAllManualResultsMutation = deleteAllManualResults.useMutation();

  if (
    !castVoteRecordFilesQuery.isSuccess ||
    !manualDataResultsMetadataQuery.isSuccess ||
    !castVoteRecordFileModeQuery.isSuccess
  ) {
    return null;
  }

  const hasManualData = manualDataResultsMetadataQuery.data.length > 0;

  function removeCvrs() {
    clearCastVoteRecordFilesMutation.mutate(undefined, {
      onSuccess: onClose,
    });
  }

  async function removeCvrsAndManualResults() {
    await Promise.all([
      clearCastVoteRecordFilesMutation.mutateAsync(),
      deleteAllManualResultsMutation.mutateAsync(),
    ]);
    onClose();
  }

  if (hasManualData) {
    const anyMutationIsLoading =
      clearCastVoteRecordFilesMutation.isLoading ||
      deleteAllManualResultsMutation.isLoading;
    return (
      <Modal
        title="Remove All CVRs"
        content={
          <P>Tallies will be removed from reports and permanently deleted.</P>
        }
        actions={
          <React.Fragment>
            <Button
              icon="Delete"
              variant="danger"
              onPress={removeCvrsAndManualResults}
              disabled={anyMutationIsLoading}
            >
              Remove CVRs and Manual Tallies
            </Button>
            <Button onPress={onClose} disabled={anyMutationIsLoading}>
              Cancel
            </Button>
            <Button
              icon="Delete"
              color="danger"
              onPress={removeCvrs}
              disabled={clearCastVoteRecordFilesMutation.isLoading}
            >
              Remove Only CVRs
            </Button>
          </React.Fragment>
        }
        onOverlayClick={onClose}
      />
    );
  }

  return (
    <Modal
      title="Remove All CVRs"
      content={
        <P>Tallies will be removed from reports and permanently deleted.</P>
      }
      actions={
        <React.Fragment>
          <Button
            icon="Delete"
            variant="danger"
            onPress={removeCvrs}
            disabled={clearCastVoteRecordFilesMutation.isLoading}
          >
            Remove All CVRs
          </Button>
          <Button
            onPress={onClose}
            disabled={clearCastVoteRecordFilesMutation.isLoading}
          >
            Cancel
          </Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
    />
  );
}
