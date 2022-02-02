import React, { useContext } from 'react';
import { useHistory } from 'react-router-dom';

import { Modal } from '@votingworks/ui';
import { AppContext } from '../contexts/app_context';
import { routerPaths } from '../router_paths';
import { Prose } from './prose';
import { Button } from './button';

export interface Props {
  onClose: () => void;
}

export function RemoveElectionModal({ onClose }: Props): JSX.Element {
  const history = useHistory();
  const { saveElection } = useContext(AppContext);

  async function unconfigureElection() {
    await saveElection(undefined);
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
          <Button onPress={onClose}>Cancel</Button>
          <Button danger onPress={unconfigureElection}>
            Remove Election Definition
          </Button>
        </React.Fragment>
      }
    />
  );
}
