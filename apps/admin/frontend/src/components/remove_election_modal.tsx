import React, { useContext } from 'react';
import { useHistory } from 'react-router-dom';

import { Button, Modal, Prose } from '@votingworks/shared-frontend';
import { AppContext } from '../contexts/app_context';
import { routerPaths } from '../router_paths';

export interface Props {
  onClose: () => void;
}

export function RemoveElectionModal({ onClose }: Props): JSX.Element {
  const history = useHistory();
  const { resetElection } = useContext(AppContext);

  async function unconfigureElection() {
    await resetElection();
    history.push(routerPaths.root);
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
          <Button danger onPress={unconfigureElection}>
            Remove Election Definition
          </Button>
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
    />
  );
}
