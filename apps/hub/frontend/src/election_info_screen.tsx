import React, { useState } from 'react';
import {
  ElectionIdSchema,
  type ElectionId,
  unsafeParse,
} from '@votingworks/types';
import { Button, H1, Modal, P } from '@votingworks/ui';
import { ElectionInfoEditor } from '@votingworks/election-definition-ui';
import { useHistory, useParams } from 'react-router-dom';
import { z } from 'zod/v4';
import {
  deleteElection,
  getBallotsFinalizedAt,
  getBallotTemplate,
} from './api.js';
import { ElectionNavScreen, Header } from './nav_screen.js';
import { routes } from './routes.js';
import { useTitle } from './hooks/use_title.js';
import { ElectionInfoAudioPanel } from './election_info_audio_panel.js';

function DeleteElectionButton({
  electionId,
}: {
  electionId: ElectionId;
}): JSX.Element {
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const deleteElectionMutation = deleteElection.useMutation();
  const history = useHistory();

  function onDeletePress() {
    setIsConfirmingDelete(true);
  }

  // @coverage-defer
  function onCancelDelete() {
    setIsConfirmingDelete(false);
  }

  function onConfirmDeletePress() {
    deleteElectionMutation.mutate(
      { electionId },
      {
        onSuccess: () => {
          history.push(routes.root.path);
        },
      }
    );
  }

  return (
    <React.Fragment>
      <Button
        disabled={deleteElectionMutation.isLoading}
        icon="Delete"
        fill="outlined"
        onPress={onDeletePress}
        variant="danger"
      >
        Delete Election
      </Button>
      {isConfirmingDelete && (
        <Modal
          title="Delete Election"
          onOverlayClick={onCancelDelete}
          content={
            <div>
              <P>
                Are you sure you want to delete this election? This action
                cannot be undone.
              </P>
            </div>
          }
          actions={
            <React.Fragment>
              <Button
                onPress={() => onConfirmDeletePress()}
                variant="danger"
                autoFocus
              >
                Delete
              </Button>
              <Button onPress={onCancelDelete}>Cancel</Button>
            </React.Fragment>
          }
        />
      )}
    </React.Fragment>
  );
}

export function ElectionInfoScreen(): JSX.Element | null {
  const params = useParams<{ electionId: string }>();
  const { electionId } = unsafeParse(
    z.object({ electionId: ElectionIdSchema }),
    params
  );
  const getBallotsFinalizedAtQuery = getBallotsFinalizedAt.useQuery(electionId);
  const ballotTemplateIdQuery = getBallotTemplate.useQuery(electionId);
  useTitle(routes.election(electionId).electionInfo.root.title);

  if (
    !getBallotsFinalizedAtQuery.isSuccess ||
    !ballotTemplateIdQuery.isSuccess
  ) {
    return null;
  }
  const ballotsFinalizedAt = getBallotsFinalizedAtQuery.data;
  const ballotTemplateId = ballotTemplateIdQuery.data;
  const showSignatureInput =
    ballotTemplateId === 'NhBallot' || ballotTemplateId === 'NhStateBallot';

  return (
    <ElectionNavScreen electionId={electionId}>
      <Header>
        <H1>Election Info</H1>
      </Header>
      <ElectionInfoEditor
        electionId={electionId}
        isLocked={!!ballotsFinalizedAt}
        showSignatureInput={showSignatureInput}
        AudioPanel={ElectionInfoAudioPanel}
        footerActions={<DeleteElectionButton electionId={electionId} />}
      />
    </ElectionNavScreen>
  );
}
