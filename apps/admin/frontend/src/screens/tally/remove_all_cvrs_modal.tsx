import { Modal, P, Button } from '@votingworks/ui';
import React from 'react';
import {
  getManualResultsMetadata,
  getCastVoteRecordFiles,
  getCastVoteRecordFileMode,
  clearCastVoteRecordFiles,
  deleteAllManualResults,
} from '../../api';

export function RemoveAllCvrsModal({
  onClose,
}: {
  onClose: VoidFunction;
}): JSX.Element | null {
  const manualResultsMetadataQuery = getManualResultsMetadata.useQuery();
  const castVoteRecordFilesQuery = getCastVoteRecordFiles.useQuery();
  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const clearCastVoteRecordFilesMutation =
    clearCastVoteRecordFiles.useMutation();
  const deleteAllManualResultsMutation = deleteAllManualResults.useMutation();

  if (
    !castVoteRecordFilesQuery.isSuccess ||
    !manualResultsMetadataQuery.isSuccess ||
    !castVoteRecordFileModeQuery.isSuccess
  ) {
    return null;
  }

  const hasManualResults = manualResultsMetadataQuery.data.length > 0;

  function removeCvrs({ doCloseModal }: { doCloseModal: boolean }) {
    clearCastVoteRecordFilesMutation.mutate(undefined, {
      onSuccess: doCloseModal ? onClose : undefined,
    });
  }

  function removeManualResults() {
    deleteAllManualResultsMutation.mutate(undefined, {
      onSuccess: onClose,
    });
  }

  if (!clearCastVoteRecordFilesMutation.isSuccess) {
    return (
      <Modal
        title="Remove All CVRs"
        content={
          <P>
            All CVRs will be permanently deleted and their tallies will be
            removed from reports.
          </P>
        }
        actions={
          <React.Fragment>
            <Button
              icon="Delete"
              variant="danger"
              onPress={() => removeCvrs({ doCloseModal: !hasManualResults })}
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

  return (
    <Modal
      title="Remove All Manual Tallies"
      content={
        <P>
          There are still manual tallies present. They must be removed to reset
          the ballot count to zero.
        </P>
      }
      actions={
        <React.Fragment>
          <Button
            icon="Delete"
            variant="danger"
            onPress={removeManualResults}
            disabled={deleteAllManualResultsMutation.isLoading}
          >
            Remove All Manual Tallies
          </Button>
          <Button
            onPress={onClose}
            disabled={deleteAllManualResultsMutation.isLoading}
          >
            Cancel
          </Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
    />
  );
}
