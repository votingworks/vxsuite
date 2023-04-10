import { Button, Modal, Prose, Text } from '@votingworks/ui';
import React from 'react';
import * as api from '../api';

export interface Props {
  batchId: string;
  batchLabel: string;
  onClose: () => void;
}

/**
 * Provides a modal for confirming the deletion of a scanned ballot batch.
 */
export function DeleteBatchModal({
  batchId,
  batchLabel,
  onClose,
}: Props): JSX.Element {
  const deleteBatchMutation = api.deleteBatch.useMutation();

  function doDeleteBatch() {
    deleteBatchMutation.mutate({ batchId }, { onSuccess: onClose });
  }

  return (
    <Modal
      centerContent
      onOverlayClick={onClose}
      content={
        <Prose textCenter>
          <h1>Delete ‘{batchLabel}’?</h1>
          <p>This action cannot be undone.</p>
          {deleteBatchMutation.error && (
            <Text error>{`${deleteBatchMutation.error}`}</Text>
          )}
        </Prose>
      }
      actions={
        <React.Fragment>
          <Button
            variant="danger"
            onPress={doDeleteBatch}
            disabled={!deleteBatchMutation.isIdle}
            autoFocus
          >
            {deleteBatchMutation.isLoading ? 'Deleting…' : 'Yes, Delete Batch'}
          </Button>
          <Button onPress={onClose} disabled={!deleteBatchMutation.isIdle}>
            Cancel
          </Button>
        </React.Fragment>
      }
    />
  );
}
