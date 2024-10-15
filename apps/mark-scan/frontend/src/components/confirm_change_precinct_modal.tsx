import { Button, Font, Modal, P } from '@votingworks/ui';
import React from 'react';
import { Election, PrecinctSelection } from '@votingworks/types';
import { getPrecinctSelectionName } from '@votingworks/utils';
import { setPrecinctSelection } from '../api';

export interface ConfirmChangePrecinctModalProps {
  election: Election;
  precinctSelection: PrecinctSelection;
  onClose: VoidFunction;
}

export function ConfirmChangePrecinctModal({
  election,
  precinctSelection,
  onClose,
}: ConfirmChangePrecinctModalProps): JSX.Element {
  const setPrecinctSelectionMutation = setPrecinctSelection.useMutation();

  return (
    <Modal
      title="Change Precinct"
      content={
        <P>
          Changing the precinct to{' '}
          <Font weight="semiBold">
            {getPrecinctSelectionName(election.precincts, precinctSelection)}
          </Font>{' '}
          will reset the ballots printed count.
        </P>
      }
      actions={
        <React.Fragment>
          <Button
            onPress={() => {
              setPrecinctSelectionMutation.mutate(
                { precinctSelection },
                {
                  onSuccess: onClose,
                }
              );
            }}
            disabled={setPrecinctSelectionMutation.isLoading}
          >
            Change Precinct
          </Button>
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
    />
  );
}
