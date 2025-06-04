import React, { useContext, useState } from 'react';
import { Button, Modal, P } from '@votingworks/ui';
import {
  getCastVoteRecordFileMode,
  markResultsOfficial,
  revertResultsToUnofficial,
} from '../api';
import { AppContext } from '../contexts/app_context';

export const MARK_RESULTS_OFFICIAL_BUTTON_TEXT =
  'Mark Election Results as Official';

export function MarkResultsOfficialButton(): JSX.Element {
  const { isOfficialResults } = useContext(AppContext);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const markResultsOfficialMutation = markResultsOfficial.useMutation();
  const castVoteRecordFileModeQuery = getCastVoteRecordFileMode.useQuery();

  const canMarkResultsOfficial =
    castVoteRecordFileModeQuery.isSuccess &&
    castVoteRecordFileModeQuery.data !== 'unlocked' &&
    !isOfficialResults;

  function openModal() {
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
  }

  function markOfficial() {
    markResultsOfficialMutation.mutate(undefined, {
      onSuccess: closeModal,
    });
  }

  return (
    <React.Fragment>
      <Button
        icon="Done"
        color="primary"
        fill="outlined"
        disabled={!canMarkResultsOfficial}
        onPress={openModal}
      >
        {MARK_RESULTS_OFFICIAL_BUTTON_TEXT}
      </Button>
      {isModalOpen && (
        <Modal
          title="Mark Election Results as Official"
          content={
            <React.Fragment>
              <P>
                Election data cannot be modified after marking results as
                official.
              </P>
              <P>
                Confirm ballot counts are correct and adjudication is complete.
              </P>
            </React.Fragment>
          }
          actions={
            <React.Fragment>
              <Button
                icon="Done"
                variant="primary"
                onPress={markOfficial}
                disabled={markResultsOfficialMutation.isLoading}
              >
                Mark Election Results as Official
              </Button>
              <Button onPress={closeModal}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={closeModal}
        />
      )}
    </React.Fragment>
  );
}

export function RevertResultsToUnofficialButton(): JSX.Element {
  const { isOfficialResults } = useContext(AppContext);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const revertResultsToUnofficialMutation =
    revertResultsToUnofficial.useMutation();

  function openModal() {
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
  }

  function revertToUnofficial() {
    revertResultsToUnofficialMutation.mutate(undefined, {
      onSuccess: closeModal,
    });
  }

  return (
    <React.Fragment>
      <Button
        icon="Delete"
        color="danger"
        fill="outlined"
        disabled={!isOfficialResults}
        onPress={openModal}
      >
        Revert Election Results to Unofficial
      </Button>
      {isModalOpen && (
        <Modal
          title="Revert Election Results to Unofficial"
          content={
            <P>
              After reverting, election managers will be able to modify election
              data. Void any previously exported official reports.
            </P>
          }
          actions={
            <React.Fragment>
              <Button
                icon="Delete"
                variant="danger"
                onPress={revertToUnofficial}
                disabled={revertResultsToUnofficialMutation.isLoading}
              >
                Revert Election Results to Unofficial
              </Button>
              <Button onPress={closeModal}>Cancel</Button>
            </React.Fragment>
          }
          onOverlayClick={closeModal}
        />
      )}
    </React.Fragment>
  );
}
