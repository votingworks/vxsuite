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
      title="Remove All Tallies"
      content={
        <P>Tallies will be removed from reports and permanently deleted.</P>
      }
      actions={
        <React.Fragment>
          <Button
            onPress={removeAllResults}
            icon="Delete"
            color="danger"
            disabled={isAnyMutationLoading}
          >
            Remove All Tallies
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
