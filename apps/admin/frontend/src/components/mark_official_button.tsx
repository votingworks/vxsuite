import React, { useContext, useState } from 'react';
import { Button, Modal, P } from '@votingworks/ui';
import { getCastVoteRecordFileMode, markResultsOfficial } from '../api';
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
    setIsModalOpen(false);
    markResultsOfficialMutation.mutate();
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
          title="Mark Unofficial Election Results as Official Election Results?"
          content={
            <React.Fragment>
              <P>
                Have all CVR files been loaded? Have unofficial tally reports
                been reviewed?
              </P>
              <P>
                Once results are marked as official, no additional CVR files can
                be loaded.
              </P>
            </React.Fragment>
          }
          actions={
            <React.Fragment>
              <Button icon="Done" variant="primary" onPress={markOfficial}>
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
