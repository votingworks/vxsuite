import React from 'react';

import { Modal, Button, P, Font } from '@votingworks/ui';
import { deleteAllManualResults } from '../api';

export interface Props {
  onClose: VoidFunction;
}

export function RemoveAllManualTalliesModal({
  onClose,
}: Props): JSX.Element | null {
  const deleteAllManualTalliesMutation = deleteAllManualResults.useMutation();

  function onConfirm() {
    deleteAllManualTalliesMutation.mutate();
    onClose();
  }
  return (
    <Modal
      title="Remove Manual Tallies"
      content={
        <P>
          Do you want to remove <Font weight="bold">all</Font> manual tallies?
        </P>
      }
      actions={
        <React.Fragment>
          <Button icon="Delete" variant="danger" onPress={onConfirm}>
            Remove All Manual Tallies
          </Button>
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
    />
  );
}
