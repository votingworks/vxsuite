import { Modal, P, Button } from '@votingworks/ui';
import React from 'react';
import {
  getManualResultsMetadata,
  getCastVoteRecordFiles,
  getCastVoteRecordFileMode,
  clearCastVoteRecordFiles,
  deleteAllManualResults,
} from '../../api';

/**
 * `RemoveAllCvrsModal` gives the user to option to remove all CVRs or cancel.
 * If there are also manual tallies, there is a follow-up modal to suggest
 * removing manual tallies. The goal is to avoid the case where users forget
 * to remove manual tallies after testing.
 */
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

  function removeCvrs() {
    clearCastVoteRecordFilesMutation.mutate(undefined, {
      onSuccess: hasManualResults ? undefined : onClose,
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
              onPress={() => removeCvrs()}
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
