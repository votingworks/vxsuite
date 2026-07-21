import React from 'react';
import { Button, Modal, P } from '@votingworks/ui';
import { format } from '@votingworks/utils';

import { deleteCastVoteRecordFile } from '../../api';
import { cvrImportTitle, LocationCvrImport } from './location_cvrs_panel';

/**
 * Confirmation modal for removing a single CVR import (for imports received
 * over the network, this is equivalent to removing the batch).
 */
export function RemoveImportModal({
  cvrImport,
  onClose,
}: {
  cvrImport: LocationCvrImport;
  onClose: VoidFunction;
}): JSX.Element {
  const deleteCastVoteRecordFileMutation =
    deleteCastVoteRecordFile.useMutation();

  function remove() {
    deleteCastVoteRecordFileMutation.mutate(
      { fileId: cvrImport.id },
      { onSuccess: onClose }
    );
  }

  return (
    <Modal
      title={`Remove ${cvrImportTitle(cvrImport)}`}
      content={
        <P>
          The {format.count(cvrImport.numCvrsImported)} CVRs loaded from this
          import will be permanently deleted and their tallies will be removed
          from reports.
        </P>
      }
      actions={
        <React.Fragment>
          <Button
            icon="Trash"
            color="danger"
            onPress={remove}
            disabled={deleteCastVoteRecordFileMutation.isLoading}
          >
            Remove
          </Button>
          <Button
            onPress={onClose}
            disabled={deleteCastVoteRecordFileMutation.isLoading}
          >
            Cancel
          </Button>
        </React.Fragment>
      }
      onOverlayClick={onClose}
    />
  );
}
