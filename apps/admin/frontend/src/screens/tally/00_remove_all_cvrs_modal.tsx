/* istanbul ignore file */

import { Modal, P, Button } from '@votingworks/ui';
import React from 'react';
import {
  getManualResultsMetadata,
  getCastVoteRecordFiles,
  getCastVoteRecordFileMode,
  clearCastVoteRecordFiles,
  deleteAllManualResults,
} from '../../api';

export type RemoveAllCvrsModalProps = Props;
interface Props {
  onClose: VoidFunction;
}

/**
 * `RemoveAllCvrsModal` gives the user to option to remove all CVRs or cancel.
 * If there are also manual tallies, there is a follow-up modal to suggest
 * removing manual tallies. The goal is to avoid the case where users forget
 * to remove manual tallies after testing.
 */
export function RemoveAllCvrsModal(props: Props): React.ReactNode {
  const { onClose } = props;

  const manualResultsMetadataQuery = getManualResultsMetadata.useQuery();
  const castVoteRecordFilesQuery = getCastVoteRecordFiles.useQuery();
  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();
  const clearCvrsMutation = clearCastVoteRecordFiles.useMutation();
  const clearManualResultsMutation = deleteAllManualResults.useMutation();

  if (
    !castVoteRecordFilesQuery.isSuccess ||
    !manualResultsMetadataQuery.isSuccess ||
    !castVoteRecordFileModeQuery.isSuccess
  ) {
    return null;
  }

  const hasManualResults = manualResultsMetadataQuery.data.length > 0;

  function removeCvrs() {
    clearCvrsMutation.mutate(undefined, {
      onSuccess: hasManualResults ? undefined : onClose,
    });
  }

  function removeManualResults() {
    clearManualResultsMutation.mutate(undefined, {
      onSuccess: onClose,
    });
  }

  const busy =
    clearCvrsMutation.isLoading || clearManualResultsMutation.isLoading;

  if (!clearCvrsMutation.isSuccess) {
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
              icon="Trash"
              variant={busy ? 'neutral' : 'danger'}
              onPress={() => removeCvrs()}
              disabled={clearCvrsMutation.isLoading}
            >
              Remove All CVRs
            </Button>
            <Button onPress={onClose} disabled={busy}>
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
            variant={busy ? 'neutral' : 'danger'}
            onPress={removeManualResults}
            disabled={busy}
          >
            Remove All Manual Tallies
          </Button>
          <Button onPress={onClose} disabled={busy}>
            Cancel
          </Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
    />
  );
}
