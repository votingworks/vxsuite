import React from 'react';
import { useHistory } from 'react-router-dom';

import { Button, Modal, Prose } from '@votingworks/ui';
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
      centerContent
      content={
        <Prose textCenter>
          <p>Do you want to remove the current election definition?</p>
          <p>All data will be removed from this app.</p>
        </Prose>
      }
      onOverlayClick={onClose}
      actions={
        <React.Fragment>
          <Button variant="danger" onPress={unconfigureElection}>
            Remove Election Definition
          </Button>
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
    />
  );
}
