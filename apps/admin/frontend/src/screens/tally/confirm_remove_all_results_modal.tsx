import React from 'react';
import { Modal, P, Button } from '@votingworks/ui';
import { clearCastVoteRecordFiles, deleteAllManualResults } from '../../api';

export function ConfirmRemoveAllResultsModal({
  onClose,
}: {
  onClose: VoidFunction;
}): JSX.Element {
  const clearCastVoteRecordFilesMutation =
    clearCastVoteRecordFiles.useMutation();
  const deleteAllManualTalliesMutation = deleteAllManualResults.useMutation();

  async function removeAllResults() {
    await Promise.all([
      clearCastVoteRecordFilesMutation.mutateAsync(),
      deleteAllManualTalliesMutation.mutateAsync(),
    ]);
    onClose();
  }

  const isAnyMutationLoading =
    clearCastVoteRecordFilesMutation.isLoading ||
    deleteAllManualTalliesMutation.isLoading;

  return (
    <Modal
      title="Remove All Results?"
      content={
        <P>
          Do you want to remove all CVRs and manual tallies? You will no longer
          be able to view any election reports.
        </P>
      }
      actions={
        <React.Fragment>
          <Button
            onPress={removeAllResults}
            icon="Delete"
            color="danger"
            disabled={isAnyMutationLoading}
          >
            Remove All Results
          </Button>
          <Button onPress={onClose} disabled={isAnyMutationLoading}>
            Cancel
          </Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
    />
  );
}
