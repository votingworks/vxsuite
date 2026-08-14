import { Button, Font, Modal, P } from '@votingworks/ui';
import type { CastVoteRecordFileRecord as CvrImport } from '@votingworks/admin-backend';
import { format } from '@votingworks/utils';

import React from 'react';
import * as api from '../../api.js';

export interface RemoveImportModalProps {
  close: VoidFunction;
  cvrImport: CvrImport;
}

export function RemoveImportModal(props: RemoveImportModalProps): JSX.Element {
  const { cvrImport, close } = props;

  const mutation = api.deleteCvrFile.useMutation();
  const deleting = mutation.status === 'loading';

  function remove() {
    mutation.mutate({ fileId: cvrImport.id }, { onSuccess: close });
  }

  const deleteButton = (
    <Button
      disabled={deleting}
      icon={deleting ? 'Loading' : 'Trash'}
      onPress={remove}
      variant={deleting ? 'neutral' : 'danger'}
    >
      {deleting ? 'Removing' : 'Remove'}
    </Button>
  );

  const cancelButton = (
    <Button onPress={close} disabled={deleting}>
      Cancel
    </Button>
  );

  const nCvrs = cvrImport.numCvrsImported;
  const scannerIds = cvrImport.scannerIds.join(', ');
  const exportDate = format.localeShortDateAndTime(
    new Date(cvrImport.exportTimestamp)
  );

  return (
    <Modal
      title="Remove CVR File"
      content={
        <React.Fragment>
          <P>
            The {format.count(nCvrs)} {nCvrs === 1 ? 'CVR' : 'CVRs'} loaded from
            this file will be permanently deleted and their tallies will be
            removed from reports.
          </P>
          <P>
            <Font weight="bold">Exported:</Font> {exportDate}
          </P>
          <P>
            <Font weight="bold">Scanners:</Font> {scannerIds}
          </P>
        </React.Fragment>
      }
      actions={
        <React.Fragment>
          {deleteButton}
          {cancelButton}
        </React.Fragment>
      }
      onOverlayClick={deleting ? undefined : close}
    />
  );
}
