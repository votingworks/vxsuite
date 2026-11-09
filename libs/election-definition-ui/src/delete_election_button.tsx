import React, { useState } from 'react';
import type { ElectionId } from '@votingworks/types';
import { Button, Modal, P } from '@votingworks/ui';
import { useElectionDefinitionApi } from './election_definition_context.js';

export interface DeleteElectionButtonProps {
  electionId: ElectionId;
  onDeleted: () => void;
}

export function DeleteElectionButton({
  electionId,
  onDeleted,
}: DeleteElectionButtonProps): JSX.Element {
  const api = useElectionDefinitionApi();
  const deleteElectionMutation = api.deleteElection.useMutation();
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  function onCancelDelete() {
    setIsConfirmingDelete(false);
  }

  function onConfirmDelete() {
    deleteElectionMutation.mutate({ electionId }, { onSuccess: onDeleted });
  }

  return (
    <React.Fragment>
      <Button
        disabled={deleteElectionMutation.isLoading}
        icon="Delete"
        fill="outlined"
        onPress={() => setIsConfirmingDelete(true)}
        variant="danger"
      >
        Delete Election
      </Button>
      {isConfirmingDelete && (
        <Modal
          title="Delete Election"
          onOverlayClick={onCancelDelete}
          content={
            <P>
              Are you sure you want to delete this election? This action cannot
              be undone.
            </P>
          }
          actions={
            <React.Fragment>
              <Button
                onPress={onConfirmDelete}
                variant="danger"
                disabled={deleteElectionMutation.isLoading}
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
