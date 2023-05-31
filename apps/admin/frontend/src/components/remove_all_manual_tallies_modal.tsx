import React from 'react';

import { Modal, Button, P, Font, H1 } from '@votingworks/ui';
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
      content={
        <React.Fragment>
          <H1>Remove Manually Entered Results</H1>
          <P>
            Do you want to remove <Font weight="bold">all</Font> manually
            entered results?
          </P>
        </React.Fragment>
      }
      actions={
        <React.Fragment>
          <Button variant="danger" onPress={onConfirm}>
            Remove All Manually Entered Results
          </Button>
          <Button onPress={onClose}>Cancel</Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
    />
  );
}
