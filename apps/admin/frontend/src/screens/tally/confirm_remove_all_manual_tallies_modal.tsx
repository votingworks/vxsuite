import React from 'react';
import { Modal, Button, P } from '@votingworks/ui';
import { deleteAllManualResults } from '../../api.js';

export function ConfirmRemoveAllManualTalliesModal({
  onClose,
}: {
  onClose: VoidFunction;
}): JSX.Element {
  const deleteAllManualTalliesMutation = deleteAllManualResults.useMutation();

  function onConfirm() {
    deleteAllManualTalliesMutation.mutate(undefined, { onSuccess: onClose });
  }

  return (
    <Modal
      title="Remove All Manual Tallies"
      content={
        <P>
          All manual tallies will be permanently deleted and removed from
          reports.
        </P>
      }
      actions={
        <React.Fragment>
          <Button
            icon="Delete"
            variant="danger"
            onPress={onConfirm}
            disabled={deleteAllManualTalliesMutation.isPending}
          >
            Remove All Manual Tallies
          </Button>
          <Button
            onPress={onClose}
            disabled={deleteAllManualTalliesMutation.isPending}
          >
            Cancel
          </Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
    />
  );
}
