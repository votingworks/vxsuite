import React from 'react';
import { useHistory } from 'react-router-dom';

import { Button, Modal, P } from '@votingworks/ui';
import { routerPaths } from '../router_paths';
import { unconfigure } from '../api';

export interface Props {
  onClose: () => void;
}

export function RemoveElectionModal({ onClose }: Props): JSX.Element {
  const history = useHistory();
  const unconfigureMutation = unconfigure.useMutation();

  function unconfigureElection() {
    unconfigureMutation.mutate(undefined, {
      onSuccess: () => {
        history.push(routerPaths.root);
      },
    });
  }

  return (
    <Modal
      title="Remove Election"
      content={
        <React.Fragment>
          <P>Do you want to remove the current election?</P>
          <P>All data will be deleted from this machine.</P>
        </React.Fragment>
      }
      onOverlayClick={onClose}
      actions={
        <React.Fragment>
          <Button icon="Delete" variant="danger" onPress={unconfigureElection}>
            Remove Election
          </Button>
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
    />
  );
}
